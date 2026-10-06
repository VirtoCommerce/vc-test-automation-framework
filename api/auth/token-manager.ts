import type { HttpClient } from "@api/http/http-client";
import type { Credentials } from "./credentials";
import type { AuthToken, TokenAuthClient } from "./token-auth-client";

import { isClientError } from "@api/http/http-error";

import { authHeader } from "./token-auth-client";

const EXPIRY_MARGIN_MS = 60_000;

interface ManagedSession {
  readonly storeId: string;
  readonly credentials: Credentials;
  readonly token: Promise<AuthToken>;
}

export class TokenManager {
  readonly #tokenAuthClient: TokenAuthClient;
  readonly #sessions = new Map<string, ManagedSession>();

  constructor(tokenAuthClient: TokenAuthClient) {
    this.#tokenAuthClient = tokenAuthClient;
  }

  async authorize(httpClient: HttpClient, credentials: Credentials, storeId: string): Promise<HttpClient> {
    await this.getToken(credentials, storeId);
    return httpClient.withHeaders(async () => authHeader(await this.getToken(credentials, storeId)));
  }

  getToken(credentials: Credentials, storeId: string): Promise<AuthToken> {
    const key = sessionKey(storeId, credentials.username);
    const session = this.#sessions.get(key);
    const token =
      session === undefined || session.credentials.password !== credentials.password
        ? this.#tokenAuthClient.requestToken(credentials, storeId)
        : session.token.then((current) => (isFresh(current) ? current : this.#renew(current, credentials, storeId)));
    this.#sessions.set(key, { storeId, credentials, token });
    token.catch(() => {
      if (this.#sessions.get(key)?.token === token) {
        this.#sessions.delete(key);
      }
    });
    return token;
  }

  async signOut(username: string, storeId: string): Promise<void> {
    const key = sessionKey(storeId, username);
    const session = this.#sessions.get(key);
    if (session === undefined) {
      return;
    }
    this.#sessions.delete(key);
    const token = await session.token.catch(() => undefined);
    if (token !== undefined && isFresh(token)) {
      await this.#tokenAuthClient.revokeToken(token);
    }
  }

  async signOutAll(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.#sessions.values()].map((session) => this.signOut(session.credentials.username, session.storeId)),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure !== undefined) {
      throw failure.reason;
    }
  }

  async #renew(token: AuthToken, credentials: Credentials, storeId: string): Promise<AuthToken> {
    if (token.refreshToken !== undefined) {
      const refreshed = await this.#tokenAuthClient.refresh(token.refreshToken).catch(ignoreClientError);
      if (refreshed !== undefined) {
        return refreshed;
      }
    }
    return this.#tokenAuthClient.requestToken(credentials, storeId);
  }
}

function sessionKey(storeId: string, username: string): string {
  return JSON.stringify([storeId, username]);
}

function isFresh(token: AuthToken): boolean {
  return token.expiresAt - EXPIRY_MARGIN_MS > Date.now();
}

function ignoreClientError(error: unknown): undefined {
  if (isClientError(error)) {
    return undefined;
  }
  throw error;
}
