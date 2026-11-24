import type { HttpClient, RequestHeaders } from "@/http";
import type { Credentials } from "./credentials.ts";
import type { AuthToken, TokenClient } from "./token-client.ts";

import { Secret } from "@/core";

import { authHeader } from "./token-client.ts";

const EXPIRY_MARGIN_MS = 60_000;

interface Session {
  readonly password: Secret;
  readonly token: Promise<AuthToken>;
}

/**
 * Represents a cache of platform access tokens, with one token for each user in each store.
 *
 * @remarks
 * - Concurrent requests for the same user share one sign-in or renewal. A failed sign-in or renewal is not cached.
 * - A token that expires within a minute is renewed with its refresh token. When the platform rejects the refresh
 *   token, the user signs in again.
 * - A token that the platform rejects with a 401 status is forgotten, so the next request signs in again.
 * - A different password for a cached user starts a new sign-in.
 *
 * @example
 * const tokens = new TokenManager(new TokenClient(anonymous));
 * const admin = await tokens.signIn(anonymous, { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD });
 * await admin.get("/api/platform/security/currentuser");
 * await tokens.signOutAll();
 */
export class TokenManager {
  readonly #tokenClient: TokenClient;
  readonly #sessions = new Map<string, Session>();

  /**
   * Creates a token cache.
   *
   * @param tokenClient - The client that signs users in and renews and revokes their tokens.
   */
  constructor(tokenClient: TokenClient) {
    this.#tokenClient = tokenClient;
  }

  /**
   * Signs a user in and returns a client that sends the user's current token with each request.
   *
   * @remarks
   * The user signs in before this method returns, so wrong credentials fail here rather than on the first request.
   * Pass a client for the same platform as the token client, because the client receives the tokens that the token
   * client gets.
   *
   * @param httpClient - The client to derive the signed-in client from. It does not change.
   * @param credentials - The sign-in data of the user.
   * @returns A new client that signs in to each request as the user.
   * @throws {HttpError} The sign-in fails.
   */
  async signIn(httpClient: HttpClient, credentials: Credentials): Promise<HttpClient> {
    await this.token(credentials);
    return httpClient.withAuthentication({
      headers: async () => authHeader(await this.token(credentials)),
      renew: (rejected: RequestHeaders) => this.#forgetRejected(credentials, rejected),
    });
  }

  /**
   * Returns a token for a user that is valid for at least another minute.
   *
   * @remarks
   * The token is the cached one, a renewed one or one from a new sign-in.
   *
   * @param credentials - The sign-in data of the user.
   * @returns The token.
   * @throws {HttpError} The sign-in or the renewal fails.
   */
  token(credentials: Credentials): Promise<AuthToken> {
    const key = sessionKey(credentials);
    const session = this.#sessions.get(key);
    const token = session?.password.equals(credentials.password)
      ? this.#current(session.token, credentials)
      : this.#tokenClient.signIn(credentials);
    this.#sessions.set(key, { password: credentials.password, token });
    token.catch(() => this.#forget(key, token));
    return token;
  }

  /**
   * Forgets the token of a user and revokes it. Does nothing when the user is not signed in.
   *
   * @param credentials - The sign-in data of the user. The user name and store identify the token.
   * @throws {HttpError} The platform does not confirm the revocation. The token is forgotten anyway.
   */
  signOut(credentials: Credentials): Promise<void> {
    return this.#signOut(sessionKey(credentials));
  }

  /**
   * Signs out every user.
   *
   * @throws {HttpError} The platform does not confirm a revocation. The first error is thrown after every user has
   * been signed out.
   */
  async signOutAll(): Promise<void> {
    const results = await Promise.allSettled([...this.#sessions.keys()].map((key: string) => this.#signOut(key)));
    const failure = results.find((result: PromiseSettledResult<void>) => result.status === "rejected");
    if (failure !== undefined) {
      throw failure.reason;
    }
  }

  async #signOut(key: string): Promise<void> {
    const session = this.#sessions.get(key);
    if (session === undefined) {
      return;
    }
    this.#sessions.delete(key);
    const token = await session.token.catch(() => undefined);
    if (token !== undefined && token.expiresAt > Date.now()) {
      await this.#tokenClient.revoke(token);
    }
  }

  async #current(previous: Promise<AuthToken>, credentials: Credentials): Promise<AuthToken> {
    const token = await previous;
    if (token.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
      return token;
    }
    if (token.refreshToken !== undefined) {
      const refreshed = await this.#tokenClient.refresh(token.refreshToken);
      if (refreshed !== undefined) {
        return refreshed;
      }
    }
    return this.#tokenClient.signIn(credentials);
  }

  async #forgetRejected(credentials: Credentials, rejected: RequestHeaders): Promise<void> {
    const key = sessionKey(credentials);
    const session = this.#sessions.get(key);
    const current = await session?.token.catch(() => undefined);
    const sent = rejected["authorization"];
    if (
      session !== undefined &&
      current !== undefined &&
      sent instanceof Secret &&
      sent.equals(authHeader(current).authorization)
    ) {
      this.#forget(key, session.token);
    }
  }

  #forget(key: string, token: Promise<AuthToken>): void {
    if (this.#sessions.get(key)?.token === token) {
      this.#sessions.delete(key);
    }
  }
}

function sessionKey({ storeId, username }: Credentials): string {
  return `${storeId ?? ""}\n${username}`;
}
