import type { APIRequestContext } from "@playwright/test";
import type { Credentials } from "./credentials.ts";
import type { StorageState } from "./storage-state.ts";

import { boolean, looseObject } from "zod";

import { HttpClient } from "@/http";

/** The options of {@link PlatformBrowserSessions}. */
export interface PlatformBrowserSessionsOptions {
  /** The base URL of the platform, whose admin UI the sessions sign in to. */
  readonly platformBaseUrl: string;
  /** Creates a request context for one sign-in. The sessions dispose of it once the sign-in is done. */
  readonly newContext: () => Promise<APIRequestContext>;
}

interface PlatformSession {
  readonly credentials: Credentials;
  readonly state: Promise<StorageState>;
}

const LOGIN_PATH = "/api/platform/security/login";

const signInResultSchema = looseObject({
  succeeded: boolean().nullish(),
  isLockedOut: boolean().nullish(),
  isNotAllowed: boolean().nullish(),
  requiresTwoFactor: boolean().nullish(),
});

/**
 * Builds the storage states that start a browser signed in to the admin UI of the platform, so browser tests skip the
 * sign-in page.
 *
 * @remarks
 * - A state holds the sign-in cookie of `POST /api/platform/security/login`, kept for each user. A different password
 *   signs in again.
 * - The cookie session expires, but the platform cannot revoke it, so there is nothing to sign out of or dispose of.
 * - A storage state holds secrets in plain text, so never log it or attach it to a report.
 *
 * @example
 * await context.setStorageState(await platformSessions.signedIn(administrator));
 */
export class PlatformBrowserSessions {
  readonly #options: PlatformBrowserSessionsOptions;
  readonly #sessions = new Map<string, PlatformSession>();

  /**
   * Creates the admin UI sessions of a worker.
   *
   * @param options - The platform base URL and the factory of request contexts.
   */
  constructor(options: PlatformBrowserSessionsOptions) {
    this.#options = options;
  }

  /**
   * Returns a storage state with a user signed in to the admin UI. Concurrent calls for one user share one sign-in.
   *
   * @param credentials - The platform user.
   * @returns The storage state, for `setStorageState` of a browser context.
   * @throws {Error} The platform refuses the sign-in. The message names the user and the reason.
   * @throws {HttpError} The sign-in request fails.
   */
  signedIn(credentials: Credentials): Promise<StorageState> {
    const { username } = credentials;
    const session = this.#sessions.get(username);
    if (session?.credentials.password.equals(credentials.password)) {
      return session.state;
    }
    const state = this.#signIn(credentials);
    this.#sessions.set(username, { credentials, state });
    state.catch(() => {
      if (this.#sessions.get(username)?.state === state) {
        this.#sessions.delete(username);
      }
    });
    return state;
  }

  /**
   * Forgets a user's storage state, such as before the user is deleted. The cookie stays valid until it expires.
   *
   * @param credentials - The user.
   */
  forget(credentials: Credentials): void {
    this.#sessions.delete(credentials.username);
  }

  async #signIn({ username, password }: Credentials): Promise<StorageState> {
    const context = await this.#options.newContext();
    try {
      const httpClient = new HttpClient(context, this.#options.platformBaseUrl);
      const result = (await httpClient.post(LOGIN_PATH, { json: { userName: username, password } })).parse(
        signInResultSchema,
      );
      if (result.succeeded !== true) {
        throw new Error(`Signing in to the platform as ${username} failed: ${rejectionReason(result)}`);
      }
      return await context.storageState();
    } finally {
      await context.dispose();
    }
  }
}

function rejectionReason(result: {
  readonly isLockedOut?: boolean | null | undefined;
  readonly isNotAllowed?: boolean | null | undefined;
  readonly requiresTwoFactor?: boolean | null | undefined;
}): string {
  if (result.isLockedOut === true) {
    return "the user is locked out";
  }
  if (result.isNotAllowed === true) {
    return "the user is not allowed to sign in, for example because the email address is not confirmed";
  }
  if (result.requiresTwoFactor === true) {
    return "the user needs two-factor authentication";
  }
  return "the user name or password is wrong";
}
