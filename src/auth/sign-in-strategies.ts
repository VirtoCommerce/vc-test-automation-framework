import type { HttpClient } from "@/http";
import type { SignInStrategy } from "./browser-sessions.ts";
import type { Credentials } from "./credentials.ts";
import type { StorageState } from "./storage-state.ts";
import type { AuthToken } from "./token-client.ts";

import { boolean, looseObject } from "zod";

import { TokenClient } from "./token-client.ts";

const VC_FRONTEND_TOKEN_KEY = "auth";
const VC_FRONTEND_ANONYMOUS_USER_ID_KEY = "user-id";
const PLATFORM_LOGIN_PATH = "/api/platform/security/login";

const signInResultSchema = looseObject({
  succeeded: boolean().nullish(),
  isLockedOut: boolean().nullish(),
  isNotAllowed: boolean().nullish(),
  requiresTwoFactor: boolean().nullish(),
});

/** The options of {@link oauthLocalStorage}. */
export interface OAuthLocalStorageOptions {
  /** The local storage key of the token entry. The default is `auth`, the key of the Virto Commerce frontend. */
  readonly storageKey?: string | undefined;
  /** The token endpoint on the application's origin. The default is `/connect/token`. */
  readonly tokenPath?: string | undefined;
  /** The revocation endpoint on the application's origin. The default is `/revoke/token`. */
  readonly revokePath?: string | undefined;
}

/**
 * Returns the strategy of the Virto Commerce frontend: the OAuth password grant on the application's own origin, with
 * the token in local storage.
 *
 * @remarks
 * - The entry is `{ expires_at, token_type, access_token, refresh_token }`, the format of the Virto Commerce frontend.
 * - The session expires with the access token. Signing out revokes it.
 *
 * @param options - The storage key and the endpoints, for a frontend that differs from the Virto Commerce one.
 * @returns The strategy, for {@link BrowserSessions}.
 */
export function oauthLocalStorage(options: OAuthLocalStorageOptions = {}): SignInStrategy {
  const storageKey = options.storageKey ?? VC_FRONTEND_TOKEN_KEY;
  return async ({ origin, http }, credentials) => {
    const client = new TokenClient(http, { tokenPath: options.tokenPath, revokePath: options.revokePath });
    const token = await client.signIn(credentials);
    return {
      state: localStorageState(origin, storageKey, tokenEntry(token)),
      expiresAt: token.expiresAt,
      signOut: () => client.revoke(token),
    };
  };
}

/** The options of {@link cookieSignIn}. */
export interface CookieSignInOptions {
  /** Ends the session on the server, such as with a logout endpoint. Without it, the cookies only expire. */
  readonly signOut?: ((http: HttpClient) => Promise<unknown>) | undefined;
}

/**
 * Returns a strategy that signs in with the requests that `signIn` sends and keeps the cookies that the responses set,
 * for an application with a cookie session.
 *
 * @remarks
 * - The requests share the session's request context, so the cookies of one request are sent with the next.
 * - The session expires with the first of its cookies that has an expiry.
 *
 * @example
 * cookieSignIn(
 *   async (http, { username, password }) =>
 *     (await http.post("/api/auth/login", { json: { username, password } })).expectOk(),
 *   { signOut: async (http) => (await http.post("/api/auth/logout")).expectOk() },
 * );
 *
 * @param signIn - Sends the sign-in requests and throws when the application refuses them.
 * @param options - How to end the session on the server.
 * @returns The strategy, for {@link BrowserSessions}.
 */
export function cookieSignIn(
  signIn: (http: HttpClient, credentials: Credentials) => Promise<unknown>,
  options: CookieSignInOptions = {},
): SignInStrategy {
  const { signOut } = options;
  return async ({ http, request }, credentials) => {
    await signIn(http, credentials);
    const state = await request.storageState();
    return {
      state,
      expiresAt: earliestExpiry(state),
      signOut:
        signOut === undefined
          ? undefined
          : async () => {
              await signOut(http);
            },
    };
  };
}

/**
 * The strategy of the admin UI of the platform: `POST /api/platform/security/login`, with the sign-in cookie. The
 * platform cannot end the cookie session, so it is not signed out.
 *
 * @throws {Error} The platform refuses the sign-in. The message names the user and the reason.
 */
export const platformAdminSignIn: SignInStrategy = cookieSignIn(async (http, { username, password }) => {
  const result = (await http.post(PLATFORM_LOGIN_PATH, { json: { userName: username, password } })).parse(
    signInResultSchema,
  );
  if (result.succeeded !== true) {
    throw new Error(`Signing in to the platform as ${username} failed: ${rejectionReason(result)}`);
  }
});

/**
 * Returns the storage state of an anonymous visitor of a frontend that keeps the visitor's identifier in local
 * storage, so the test knows whose cart it works with. It sends no requests.
 *
 * @param frontendBaseUrl - A URL of the frontend. Only its origin counts.
 * @param anonymousUserId - The identifier of the visitor.
 * @param storageKey - The local storage key. The default is `user-id`, the key of the Virto Commerce frontend.
 * @returns The storage state, for `setStorageState` of a browser context.
 */
export function anonymousVisitorState(
  frontendBaseUrl: string,
  anonymousUserId: string,
  storageKey = VC_FRONTEND_ANONYMOUS_USER_ID_KEY,
): StorageState {
  return localStorageState(new URL(frontendBaseUrl).origin, storageKey, anonymousUserId);
}

function localStorageState(origin: string, name: string, value: string): StorageState {
  return { cookies: [], origins: [{ origin, localStorage: [{ name, value }] }] };
}

function tokenEntry(token: AuthToken): string {
  return JSON.stringify({
    expires_at: new Date(token.expiresAt).toISOString(),
    token_type: token.tokenType,
    access_token: token.accessToken.reveal(),
    refresh_token: token.refreshToken?.reveal(),
  });
}

function earliestExpiry(state: StorageState): number | undefined {
  const expiries = state.cookies.filter(({ expires }) => expires > 0).map(({ expires }) => expires * 1000);
  return expiries.length === 0 ? undefined : Math.min(...expiries);
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
