import type { HttpClient, HttpHeaders } from "../http/http-client";
import type { HttpResponse } from "../http/http-response";
import type { Credentials } from "./credentials";

import { setTimeout as sleep } from "node:timers/promises";

import { number, object } from "zod";

import { Secret } from "@core/secret";
import { nonEmptyString, secretString } from "@core/validation";

const TOKEN_PATH = "/connect/token";
const REVOKE_PATH = "/revoke/token";
const RETRY_DELAYS_MS: readonly number[] = [300, 600, 1_200, 2_400, 4_800];
const RETRY_JITTER_MS = 300;

const TokenResponseSchema = object({
  access_token: secretString,
  token_type: nonEmptyString,
  expires_in: number().int().positive(),
  refresh_token: secretString.optional(),
});

type TokenForm = Readonly<Record<string, string>>;

/** Platform access token with what is needed to send, renew and revoke it. */
export interface AuthToken {
  readonly accessToken: Secret;
  /** Such as `Bearer`. */
  readonly tokenType: string;
  /** Expiry in epoch milliseconds, counted from the request time, so it errs early. */
  readonly expiresAt: number;
  /** `undefined` when the platform issued none. */
  readonly refreshToken: Secret | undefined;
}

/**
 * Calls the platform's OAuth endpoints (`POST /connect/token`, `/revoke/token`): password sign-in, refresh, revoke.
 * A `500` is retried up to five times with backoff and a process warning, because the platform answers `500` to
 * concurrent sign-ins of one user; other errors fail at once. Tokens are {@link Secret}s as soon as they are parsed.
 * Tests normally get tokens through `TokenManager`; use this directly only to test sign-in itself.
 *
 * @example
 * const tokens = new TokenClient(new HttpClient(context), env.storeId);
 * const token = await tokens.signIn(env.admin);
 * const signedIn = client.withHeaders(authHeader(token));
 */
export class TokenClient {
  readonly #httpClient: HttpClient;
  readonly #storeId: string;

  /** @param storeId - Store users sign in to; frontend users exist only within their store. */
  constructor(httpClient: HttpClient, storeId: string) {
    this.#httpClient = httpClient;
    this.#storeId = storeId;
  }

  /**
   * Signs in with the password grant.
   *
   * @throws HttpError when the credentials are rejected, `500` persists after the retries, another error status
   * comes back, or the body is not a token.
   */
  async signIn(credentials: Credentials): Promise<AuthToken> {
    const requestedAt = Date.now();
    const response = await this.#requestToken(this.#passwordGrant(credentials));
    return toAuthToken(response, requestedAt);
  }

  /**
   * Sends one password grant and returns the raw response whatever its status, for sign-in tests. Never retried.
   *
   * @param extra - Extra form fields such as `organization_id`; they override the standard ones.
   */
  requestPasswordGrant(credentials: Credentials, extra: TokenForm = {}): Promise<HttpResponse> {
    return this.#httpClient.post(TOKEN_PATH, { form: { ...this.#passwordGrant(credentials), ...extra } });
  }

  /**
   * Renews a token with its refresh token.
   *
   * @returns `undefined` when the platform rejects the refresh token with `400` (expired or revoked).
   * @throws HttpError when `500` persists after the retries, another error status comes back, or the body is not
   * a token.
   */
  async refresh(refreshToken: Secret): Promise<AuthToken | undefined> {
    const requestedAt = Date.now();
    const response = await this.#requestToken({ grant_type: "refresh_token", refresh_token: refreshToken.reveal() });
    return response.status === 400 ? undefined : toAuthToken(response, requestedAt);
  }

  /**
   * Revokes the token so its refresh token stops working. The access token stays valid until it expires
   * (30 minutes after issue on the platform).
   *
   * @throws HttpError when the platform does not confirm it.
   */
  async revoke(token: AuthToken): Promise<void> {
    (await this.#httpClient.post(REVOKE_PATH, { headers: authHeader(token) })).expectOk();
  }

  #passwordGrant({ username, password }: Credentials): TokenForm {
    return {
      grant_type: "password",
      username,
      password: password.reveal(),
      storeId: this.#storeId,
      scope: "offline_access",
    };
  }

  async #requestToken(form: TokenForm): Promise<HttpResponse> {
    let response = await this.#httpClient.post(TOKEN_PATH, { form });
    for (const delayMs of RETRY_DELAYS_MS) {
      if (response.status !== 500) {
        return response;
      }
      const waitMs = Math.round(delayMs + Math.random() * RETRY_JITTER_MS);
      process.emitWarning(Secret.mask(`${response.method} ${response.url} → 500, retrying in ${waitMs} ms`));
      await sleep(waitMs);
      response = await this.#httpClient.post(TOKEN_PATH, { form });
    }
    return response;
  }
}

/** Builds the `Authorization` header for a token, such as `{ Authorization: "Bearer eyJ…" }`. */
export function authHeader(token: AuthToken): HttpHeaders {
  return { Authorization: `${token.tokenType} ${token.accessToken.reveal()}` };
}

function toAuthToken(response: HttpResponse, requestedAt: number): AuthToken {
  const body = response.parse(TokenResponseSchema);
  return {
    accessToken: body.access_token,
    tokenType: body.token_type,
    expiresAt: requestedAt + body.expires_in * 1000,
    refreshToken: body.refresh_token,
  };
}
