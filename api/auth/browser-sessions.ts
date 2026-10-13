import type { APIRequestContext } from "@playwright/test";
import type { LoginRequestData, SignInResultData } from "../rest/types/security";
import type { Credentials } from "./credentials";
import type { AuthToken } from "./token-client";
import type { TokenManager } from "./token-manager";

import { HttpClient } from "../http/http-client";

/** App a browser test opens: `frontend`, or `backend` for the platform's admin UI. */
export type App = "frontend" | "backend";

/** Cookies and local storage in the shape of Playwright's `storageState` option. */
export type StorageState = Awaited<ReturnType<APIRequestContext["storageState"]>>;

const LOGIN_PATH = "/api/platform/security/login";
const FRONTEND_AUTH_KEY = "auth";
const FRONTEND_USER_ID_KEY = "user-id";

interface BackendSession {
  readonly credentials: Credentials;
  readonly state: Promise<StorageState>;
}

/** Where the frontend and the admin UI live. */
export interface BrowserSessionsOptions {
  /** Its origin owns the local storage entries. */
  readonly frontendBaseUrl: string;
  /** Creates a request context on the platform's base URL; one per admin UI sign-in, disposed of afterwards. */
  readonly newBackendContext: () => Promise<APIRequestContext>;
}

/**
 * Builds storage states so browser tests start signed in, skipping the sign-in page.
 *
 * - Frontend: the {@link TokenManager} token in local storage `auth` as `{ expires_at, token_type, access_token,
 *   refresh_token }`; if the frontend changes that format, every signed-in frontend test breaks.
 * - Admin UI: the cookie from `POST /api/platform/security/login`, cached per user (concurrent calls share one
 *   sign-in) until {@link BrowserSessions#signOut}; a different password signs in again. The cookie session is
 *   never revoked, only expires, and the cookie is not a `Secret`: never log a storage state.
 *
 * @example
 * const state = await sessions.signedIn("frontend", customer);
 * const page = await (await browser.newContext({ storageState: state })).newPage();
 */
export class BrowserSessions {
  readonly #frontendTokens: TokenManager;
  readonly #options: BrowserSessionsOptions;
  readonly #backendSessions = new Map<string, BackendSession>();

  constructor(frontendTokens: TokenManager, options: BrowserSessionsOptions) {
    this.#frontendTokens = frontendTokens;
    this.#options = options;
  }

  /**
   * Returns a storage state with the user signed in, to pass as `storageState` to a new browser context.
   *
   * @throws HttpError when a sign-in request fails; Error naming the reason when the admin UI refuses the sign-in.
   */
  signedIn(app: App, credentials: Credentials): Promise<StorageState> {
    return app === "frontend" ? this.#frontendState(credentials) : this.#backendState(credentials);
  }

  /**
   * Returns a signed-out storage state: for the frontend, local storage `user-id` set; empty for the admin UI.
   *
   * @param anonymousUserId - Frontend visitor id, so the test knows whose cart it works with; ignored for `backend`.
   */
  anonymous(app: App, anonymousUserId: string): StorageState {
    return app === "frontend"
      ? this.#frontendStorage(FRONTEND_USER_ID_KEY, anonymousUserId)
      : { cookies: [], origins: [] };
  }

  /**
   * Forgets the user's admin UI state and revokes their frontend token via {@link TokenManager#signOut}.
   *
   * @throws HttpError when the platform does not confirm the token revocation.
   */
  async signOut(username: string): Promise<void> {
    this.#backendSessions.delete(username);
    await this.#frontendTokens.signOut(username);
  }

  async #frontendState(credentials: Credentials): Promise<StorageState> {
    const token = await this.#frontendTokens.token(credentials);
    return this.#frontendStorage(FRONTEND_AUTH_KEY, frontendAuthValue(token));
  }

  #backendState(credentials: Credentials): Promise<StorageState> {
    const { username } = credentials;
    const session = this.#backendSessions.get(username);
    if (session?.credentials.password.equals(credentials.password)) {
      return session.state;
    }
    const state = this.#signInWithCookie(credentials);
    this.#backendSessions.set(username, { credentials, state });
    state.catch(() => this.#forget(username, state));
    return state;
  }

  async #signInWithCookie({ username, password }: Credentials): Promise<StorageState> {
    const context = await this.#options.newBackendContext();
    try {
      const request: LoginRequestData = { userName: username, password: password.reveal() };
      const result = (await new HttpClient(context).post(LOGIN_PATH, { json: request })).json<SignInResultData>();
      if (result.succeeded !== true) {
        throw new Error(`Platform sign-in as ${username} failed: ${rejectionReason(result)}`);
      }
      return await context.storageState();
    } finally {
      await context.dispose();
    }
  }

  #frontendStorage(name: string, value: string): StorageState {
    return {
      cookies: [],
      origins: [{ origin: new URL(this.#options.frontendBaseUrl).origin, localStorage: [{ name, value }] }],
    };
  }

  #forget(username: string, state: Promise<StorageState>): void {
    if (this.#backendSessions.get(username)?.state === state) {
      this.#backendSessions.delete(username);
    }
  }
}

function rejectionReason(result: SignInResultData): string {
  if (result.isLockedOut === true) {
    return "the user is locked out";
  }
  if (result.isNotAllowed === true) {
    return "the user is not allowed to sign in (for example, the email is not confirmed)";
  }
  if (result.requiresTwoFactor === true) {
    return "the user requires two-factor authentication";
  }
  return "wrong user name or password";
}

function frontendAuthValue(token: AuthToken): string {
  return JSON.stringify({
    expires_at: new Date(token.expiresAt).toISOString(),
    token_type: token.tokenType,
    access_token: token.accessToken.reveal(),
    refresh_token: token.refreshToken?.reveal(),
  });
}
