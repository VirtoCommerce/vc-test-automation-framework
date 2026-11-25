import type { APIRequestContext } from "@playwright/test";
import type { Credentials } from "./credentials.ts";
import type { StorageState } from "./storage-state.ts";

import { HttpClient } from "@/http";

const EXPIRY_MARGIN_MS = 60_000;

/** A signed-in browser session, which a {@link SignInStrategy} returns. */
export interface BrowserSession {
  /** The storage state that starts a browser signed in. It holds secrets in plain text, so never log it. */
  readonly state: StorageState;
  /**
   * When the session stops working, in milliseconds since the Unix epoch. A session that expires within a minute signs
   * in again. Without it, the session is kept until it is signed out.
   */
  readonly expiresAt?: number | undefined;
  /** Ends the session on the server, such as by revoking a token or calling a logout endpoint. */
  readonly signOut?: (() => Promise<void>) | undefined;
}

/** What a {@link SignInStrategy} signs a user in with. */
export interface SignInContext {
  /** The origin of the application, such as `https://frontend.example.com`. */
  readonly origin: string;
  /** A client of {@link origin} on {@link request}. */
  readonly http: HttpClient;
  /**
   * The request context of the session. It keeps the cookies that the responses set and is disposed of when the session
   * ends.
   */
  readonly request: APIRequestContext;
}

/**
 * Signs a user in to an application and returns the session. The strategy of {@link BrowserSessions}: one for each
 * way an application signs users in.
 */
export type SignInStrategy = (context: SignInContext, credentials: Credentials) => Promise<BrowserSession>;

/** The options of {@link BrowserSessions}. */
export interface BrowserSessionsOptions {
  /** Creates a request context, one for each session. The sessions dispose of every context they create. */
  readonly newContext: () => Promise<APIRequestContext>;
  /** How users sign in. */
  readonly strategy: SignInStrategy;
}

interface OpenSession extends BrowserSession {
  readonly request: APIRequestContext;
}

interface CachedSession {
  readonly credentials: Credentials;
  readonly session: Promise<OpenSession>;
}

/**
 * Builds the storage states that start a browser signed in to an application, so browser tests skip the sign-in page.
 *
 * @remarks
 * - The strategy decides how a user signs in. The sessions keep one session for each user, store and origin, each with
 *   a request context of its own.
 * - Concurrent calls for the same user share one sign-in. A failed sign-in is not kept, and its request context is
 *   disposed of.
 * - A session that expires within a minute signs in again. A different password for a kept user signs out the old
 *   session and signs in again.
 * - {@link BrowserSessions.signOut} and {@link BrowserSessions.dispose} end the sessions on the server and dispose of
 *   their request contexts. A session past its expiry is not signed out, because the server no longer accepts it.
 *
 * @example
 * const sessions = new BrowserSessions({ newContext, strategy: oauthLocalStorage() });
 * await context.setStorageState(await sessions.signedIn(env.FRONTEND_BASE_URL, customer));
 */
export class BrowserSessions {
  readonly #options: BrowserSessionsOptions;
  readonly #sessions = new Map<string, CachedSession>();

  /**
   * Creates the browser sessions of a worker.
   *
   * @param options - The factory of request contexts and the sign-in strategy.
   */
  constructor(options: BrowserSessionsOptions) {
    this.#options = options;
  }

  /**
   * Returns a storage state with a user signed in to an application.
   *
   * @param baseUrl - A URL of the application, such as `https://frontend.example.com`. Only its origin counts.
   * @param credentials - The user, with the store for a frontend user.
   * @returns The storage state, for `setStorageState` of a browser context.
   * @throws {Error} The strategy fails to sign the user in.
   */
  async signedIn(baseUrl: string, credentials: Credentials): Promise<StorageState> {
    const origin = new URL(baseUrl).origin;
    const key = sessionKey(origin, credentials);
    const cached = this.#sessions.get(key);
    const session = cached?.credentials.password.equals(credentials.password)
      ? this.#current(cached.session, origin, credentials)
      : this.#replace(cached?.session, origin, credentials);
    this.#sessions.set(key, { credentials, session });
    session.catch(() => {
      if (this.#sessions.get(key)?.session === session) {
        this.#sessions.delete(key);
      }
    });
    return (await session).state;
  }

  /**
   * Ends a user's sessions on every origin, such as before the user is deleted. The next call signs in again.
   *
   * @param credentials - The user. The user name and store identify the sessions.
   * @throws {Error} A session is not signed out. Every session of the user is closed first.
   */
  async signOut(credentials: Credentials): Promise<void> {
    await this.#close(
      [...this.#sessions].filter(([, cached]) => sameUser(cached.credentials, credentials)).map(([key]) => key),
    );
  }

  /**
   * Ends every session and disposes of the request contexts.
   *
   * @throws {Error} A session is not signed out. Every session is closed first, and the first error is thrown.
   */
  async dispose(): Promise<void> {
    await this.#close([...this.#sessions.keys()]);
  }

  async #close(keys: readonly string[]): Promise<void> {
    const sessions = keys.flatMap((key) => {
      const cached = this.#sessions.get(key);
      this.#sessions.delete(key);
      return cached === undefined ? [] : [cached.session];
    });
    const results = await Promise.allSettled(
      sessions.map(async (session) => close(await session.catch(() => undefined))),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure !== undefined) {
      throw failure.reason;
    }
  }

  async #current(previous: Promise<OpenSession>, origin: string, credentials: Credentials): Promise<OpenSession> {
    const session = await previous;
    if (session.expiresAt === undefined || session.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
      return session;
    }
    await close(session);
    return this.#open(origin, credentials);
  }

  async #replace(
    previous: Promise<OpenSession> | undefined,
    origin: string,
    credentials: Credentials,
  ): Promise<OpenSession> {
    await close(await previous?.catch(() => undefined));
    return this.#open(origin, credentials);
  }

  async #open(origin: string, credentials: Credentials): Promise<OpenSession> {
    const request = await this.#options.newContext();
    try {
      const session = await this.#options.strategy(
        { origin, http: new HttpClient(request, origin), request },
        credentials,
      );
      return { ...session, request };
    } catch (error) {
      await request.dispose();
      throw error;
    }
  }
}

async function close(session: OpenSession | undefined): Promise<void> {
  if (session === undefined) {
    return;
  }
  try {
    if (session.expiresAt === undefined || session.expiresAt > Date.now()) {
      await session.signOut?.();
    }
  } finally {
    await session.request.dispose();
  }
}

function sessionKey(origin: string, { storeId, username }: Credentials): string {
  return `${origin}\n${storeId ?? ""}\n${username}`;
}

function sameUser(first: Credentials, second: Credentials): boolean {
  return first.username === second.username && first.storeId === second.storeId;
}
