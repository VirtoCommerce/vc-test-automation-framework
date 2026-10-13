import type { HttpClient, HttpHeaders } from "../http/http-client";
import type { Credentials } from "./credentials";
import type { AuthToken, TokenClient } from "./token-client";

import { Secret } from "@core/secret";

import { authHeader } from "./token-client";

const EXPIRY_MARGIN_MS = 60_000;

interface Session {
  readonly credentials: Credentials;
  readonly token: Promise<AuthToken>;
}

/**
 * Caches one platform token per user name, for the one store fixed in its {@link TokenClient}.
 *
 * - Concurrent requests for a user share one sign-in or renewal; failures are not cached.
 * - A token with under a minute left is renewed via its refresh token, or a new sign-in if that is missing or rejected.
 * - A token rejected with 401 is never handed out again; a different password revokes the old token first.
 * - Call {@link TokenManager#signOut} / {@link TokenManager#signOutAll} when done, so no renewable token is left.
 *
 * @example
 * const tokens = new TokenManager(new TokenClient(new HttpClient(context), env.storeId));
 * const admin = await tokens.signedIn(new HttpClient(context), env.admin);
 * await admin.get("/api/platform/security/currentuser");
 * await tokens.signOutAll();
 */
export class TokenManager {
  readonly #tokenClient: TokenClient;
  readonly #sessions = new Map<string, Session>();
  readonly #rejected = new WeakSet<AuthToken>();

  constructor(tokenClient: TokenClient) {
    this.#tokenClient = tokenClient;
  }

  /**
   * Signs the user in and returns a copy of `httpClient` that sends the current token on every request.
   * On a 401 (e.g. sessions ended by a membership lock) it signs in again and repeats the request once.
   * Using the client after {@link TokenManager#signOut} signs the user in again.
   *
   * @throws HttpError when the sign-in fails, so a wrong password fails here and not on the first request.
   */
  async signedIn(httpClient: HttpClient, credentials: Credentials): Promise<HttpClient> {
    await this.token(credentials);
    return httpClient.withAuthentication({
      headers: async () => authHeader(await this.token(credentials)),
      renew: (rejectedHeaders) => this.#reject(credentials.username, rejectedHeaders),
    });
  }

  /**
   * Returns a token with at least a minute left: cached, renewed or from a new sign-in.
   *
   * @throws HttpError when signing in or renewing fails.
   */
  token(credentials: Credentials): Promise<AuthToken> {
    const { username } = credentials;
    const token = this.#nextToken(this.#sessions.get(username), credentials);
    this.#sessions.set(username, { credentials, token });
    token.catch(() => this.#forget(username, token));
    return token;
  }

  /**
   * Forgets the user's token and revokes it. No-op for a user not signed in; a token with under a minute left
   * is not revoked, to avoid racing its expiry.
   *
   * @throws HttpError when the platform does not confirm the revocation; the token is forgotten anyway.
   */
  async signOut(username: string): Promise<void> {
    const session = this.#sessions.get(username);
    if (session === undefined) {
      return;
    }
    this.#sessions.delete(username);
    await this.#revokeIfFresh(session.token);
  }

  /**
   * Signs every user out.
   *
   * @throws The first {@link TokenManager#signOut} error, after every user was tried.
   */
  async signOutAll(): Promise<void> {
    const results = await Promise.allSettled([...this.#sessions.keys()].map((username) => this.signOut(username)));
    const failure = results.find((result) => result.status === "rejected");
    if (failure !== undefined) {
      throw failure.reason;
    }
  }

  async #nextToken(session: Session | undefined, credentials: Credentials): Promise<AuthToken> {
    if (session === undefined) {
      return this.#tokenClient.signIn(credentials);
    }
    if (session.credentials.password.equals(credentials.password)) {
      const current = await session.token;
      if (this.#rejected.has(current)) {
        return this.#tokenClient.signIn(credentials);
      }
      return isFresh(current) ? current : this.#renew(current, credentials);
    }
    await this.#revokeIfFresh(session.token).catch((error: unknown) =>
      warnRevocationFailed(credentials.username, error),
    );
    return this.#tokenClient.signIn(credentials);
  }

  async #renew(token: AuthToken, credentials: Credentials): Promise<AuthToken> {
    const refreshed =
      token.refreshToken === undefined ? undefined : await this.#tokenClient.refresh(token.refreshToken);
    return refreshed ?? this.#tokenClient.signIn(credentials);
  }

  async #revokeIfFresh(token: Promise<AuthToken>): Promise<void> {
    const current = await token.catch(() => undefined);
    if (current !== undefined && isFresh(current) && !this.#rejected.has(current)) {
      await this.#tokenClient.revoke(current);
    }
  }

  async #reject(username: string, rejectedHeaders: HttpHeaders): Promise<void> {
    const current = await this.#sessions.get(username)?.token.catch(() => undefined);
    if (current !== undefined && isSameAuthorization(current, rejectedHeaders)) {
      this.#rejected.add(current);
    }
  }

  #forget(username: string, token: Promise<AuthToken>): void {
    if (this.#sessions.get(username)?.token === token) {
      this.#sessions.delete(username);
    }
  }
}

function isSameAuthorization(token: AuthToken, headers: HttpHeaders): boolean {
  const sent = Object.entries(headers).find(([name]) => name.toLowerCase() === "authorization")?.[1];
  return sent === authHeader(token)["Authorization"];
}

function isFresh(token: AuthToken): boolean {
  return token.expiresAt - EXPIRY_MARGIN_MS > Date.now();
}

function warnRevocationFailed(username: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  process.emitWarning(Secret.mask(`could not revoke the previous token of ${username}: ${reason}`));
}
