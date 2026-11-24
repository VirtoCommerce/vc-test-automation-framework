import type { APIRequestContext } from "@playwright/test";
import type { Credentials } from "./credentials.ts";
import type { StorageState } from "./storage-state.ts";
import type { AuthToken } from "./token-client.ts";

import { HttpClient } from "@/http";

import { TokenClient } from "./token-client.ts";
import { TokenManager } from "./token-manager.ts";

/** The local storage keys where a frontend keeps its sign-in. */
export interface FrontendStorageKeys {
  /** The key of the token entry. The default is `auth`, the key of the Virto Commerce frontend. */
  readonly token?: string | undefined;
  /** The key of an anonymous visitor's identifier. The default is `user-id`, the key of the Virto Commerce frontend. */
  readonly anonymousUserId?: string | undefined;
}

/** The options of {@link FrontendBrowserSessions}. */
export interface FrontendBrowserSessionsOptions {
  /** Creates a request context, one for each frontend. The sessions dispose of every context they create. */
  readonly newContext: () => Promise<APIRequestContext>;
  /** Where the frontends keep their sign-in in local storage. The defaults are those of the Virto Commerce frontend. */
  readonly storageKeys?: FrontendStorageKeys | undefined;
}

interface FrontendTokens {
  readonly context: APIRequestContext;
  readonly tokens: TokenManager;
}

/**
 * Builds the storage states that start a browser on a frontend, signed in or as an anonymous visitor, so browser tests
 * skip the sign-in page.
 *
 * @remarks
 * - A signed-in state holds a token in local storage, requested through the frontend's own origin. The entry is
 *   `{ expires_at, token_type, access_token, refresh_token }`, the format of the Virto Commerce frontend.
 * - Tokens are kept for each user and frontend until {@link FrontendBrowserSessions.signOut} or
 *   {@link FrontendBrowserSessions.dispose}, which revoke them.
 * - A storage state holds secrets in plain text, so never log it or attach it to a report.
 *
 * @example
 * await context.setStorageState(await frontendSessions.signedIn(env.FRONTEND_BASE_URL, customer));
 */
export class FrontendBrowserSessions {
  readonly #newContext: () => Promise<APIRequestContext>;
  readonly #tokenKey: string;
  readonly #anonymousUserIdKey: string;
  readonly #frontends = new Map<string, Promise<FrontendTokens>>();

  /**
   * Creates the frontend sessions of a worker.
   *
   * @param options - The factory of request contexts and the storage keys.
   */
  constructor(options: FrontendBrowserSessionsOptions) {
    this.#newContext = options.newContext;
    this.#tokenKey = options.storageKeys?.token ?? "auth";
    this.#anonymousUserIdKey = options.storageKeys?.anonymousUserId ?? "user-id";
  }

  /**
   * Returns a storage state with a user signed in to a frontend. Concurrent calls for one user share one sign-in.
   *
   * @param frontendBaseUrl - The base URL of the frontend, such as `https://frontend.example.com`.
   * @param credentials - The user, with the store of the frontend.
   * @returns The storage state, for `setStorageState` of a browser context.
   * @throws {HttpError} The frontend refuses the sign-in.
   */
  async signedIn(frontendBaseUrl: string, credentials: Credentials): Promise<StorageState> {
    const { tokens } = await this.#frontendTokens(frontendBaseUrl);
    return localStorageState(frontendBaseUrl, this.#tokenKey, tokenEntry(await tokens.token(credentials)));
  }

  /**
   * Returns a storage state of an anonymous visitor of a frontend. It sends no requests.
   *
   * @param frontendBaseUrl - The base URL of the frontend.
   * @param anonymousUserId - The identifier of the visitor, so the test knows whose cart it works with.
   * @returns The storage state, for `setStorageState` of a browser context.
   */
  anonymous(frontendBaseUrl: string, anonymousUserId: string): StorageState {
    return localStorageState(frontendBaseUrl, this.#anonymousUserIdKey, anonymousUserId);
  }

  /**
   * Revokes a user's tokens on every frontend, such as before the user is deleted.
   *
   * @param credentials - The user.
   * @throws {HttpError} A frontend does not confirm the revocation.
   */
  async signOut(credentials: Credentials): Promise<void> {
    for (const frontend of this.#frontends.values()) {
      await (await frontend).tokens.signOut(credentials);
    }
  }

  /**
   * Revokes every token and disposes of the request contexts.
   *
   * @throws {Error} A frontend does not confirm a revocation. Every context is disposed of first.
   * @throws {AggregateError} Several frontends do not confirm revocations.
   */
  async dispose(): Promise<void> {
    const frontends = [...this.#frontends.values()];
    this.#frontends.clear();
    const errors: unknown[] = [];
    for (const frontend of frontends) {
      try {
        const { context, tokens } = await frontend;
        try {
          await tokens.signOutAll();
        } finally {
          await context.dispose();
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, `${errors.length} frontends did not confirm the sign-out`);
    }
  }

  #frontendTokens(frontendBaseUrl: string): Promise<FrontendTokens> {
    const origin = new URL(frontendBaseUrl).origin;
    const existing = this.#frontends.get(origin);
    if (existing !== undefined) {
      return existing;
    }
    const created = this.#newContext().then((context) => ({
      context,
      tokens: new TokenManager(new TokenClient(new HttpClient(context, origin))),
    }));
    this.#frontends.set(origin, created);
    created.catch(() => {
      if (this.#frontends.get(origin) === created) {
        this.#frontends.delete(origin);
      }
    });
    return created;
  }
}

function tokenEntry(token: AuthToken): string {
  return JSON.stringify({
    expires_at: new Date(token.expiresAt).toISOString(),
    token_type: token.tokenType,
    access_token: token.accessToken.reveal(),
    refresh_token: token.refreshToken?.reveal(),
  });
}

function localStorageState(frontendBaseUrl: string, name: string, value: string): StorageState {
  return {
    cookies: [],
    origins: [{ origin: new URL(frontendBaseUrl).origin, localStorage: [{ name, value }] }],
  };
}
