import type { Secret } from "@/core";
import type { HttpClient, HttpResponse } from "@/http";
import type { Credentials } from "./credentials.ts";

import { number, object } from "zod";

import { nonBlankString, secretString } from "@/core";

import { withSignInLock } from "./sign-in-lock.ts";

const TOKEN_PATH = "/connect/token";
const REVOKE_PATH = "/revoke/token";

const tokenResponseSchema = object({
  access_token: secretString,
  token_type: nonBlankString,
  expires_in: number().int().positive(),
  refresh_token: secretString.optional(),
});

/** A platform access token, with the data needed to send, renew and revoke it. */
export interface AuthToken {
  /** The access token. */
  readonly accessToken: Secret;
  /** The type of the token, such as `Bearer`. */
  readonly tokenType: string;
  /**
   * The expiry time in milliseconds since the Unix epoch. It is counted from the time of the request, so it is slightly
   * earlier than the actual expiry.
   */
  readonly expiresAt: number;
  /** The refresh token, or `undefined` when the platform did not issue one. */
  readonly refreshToken: Secret | undefined;
}

/**
 * Represents a client for the platform token endpoints: password sign-in, token refresh and token revocation.
 *
 * @remarks
 * - The client sends each request once and does not retry a failure.
 * - Sign-ins of the same user in the same store wait for each other, also across the processes of a machine, such as
 *   Playwright workers, because the platform returns a 500 status for concurrent ones. `requestPasswordGrant` does
 *   not wait, so sign-in tests send exactly the requests they mean to.
 */
export class TokenClient {
  readonly #httpClient: HttpClient;

  /**
   * Creates a token client.
   *
   * @param httpClient - The client that sends requests to the platform.
   */
  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  /**
   * Signs in a user with a password.
   *
   * @param credentials - The sign-in data of the user.
   * @returns The access token of the user.
   * @throws {HttpError} The platform rejects the sign-in or returns another error status, or the response is not a
   * token.
   */
  async signIn(credentials: Credentials): Promise<AuthToken> {
    return withSignInLock(credentials, async () => {
      const requestedAt = Date.now();
      return toAuthToken(await this.requestPasswordGrant(credentials), requestedAt);
    });
  }

  /**
   * Sends a password sign-in request and returns the response, whatever its status. Use it in tests of the sign-in
   * itself.
   *
   * @param credentials - The sign-in data of the user.
   * @param extra - Additional form fields, such as `organization_id`. They replace standard fields of the same name.
   * @returns The response.
   */
  requestPasswordGrant(credentials: Credentials, extra: Readonly<Record<string, string>> = {}): Promise<HttpResponse> {
    return this.#httpClient.post(TOKEN_PATH, { form: { ...passwordGrant(credentials), ...extra } });
  }

  /**
   * Renews an access token with a refresh token.
   *
   * @param refreshToken - The refresh token.
   * @returns The new access token, or `undefined` when the platform rejects the refresh token with a 400 status,
   * because it has expired or has been revoked.
   * @throws {HttpError} The platform returns another error status, or the response is not a token.
   */
  async refresh(refreshToken: Secret): Promise<AuthToken | undefined> {
    const requestedAt = Date.now();
    const response = await this.#httpClient.post(TOKEN_PATH, {
      form: { grant_type: "refresh_token", refresh_token: refreshToken },
    });
    return response.status === 400 ? undefined : toAuthToken(response, requestedAt);
  }

  /**
   * Revokes the refresh token of an access token.
   *
   * @remarks
   * The access token itself stays valid until it expires.
   *
   * @param token - The access token whose refresh token is revoked.
   * @throws {HttpError} The platform does not confirm the revocation.
   */
  async revoke(token: AuthToken): Promise<void> {
    (await this.#httpClient.post(REVOKE_PATH, { headers: authHeader(token) })).expectOk();
  }
}

/**
 * Returns the `Authorization` header for an access token.
 *
 * @param token - The access token.
 * @returns The header, with its value as a {@link Secret} that is revealed only when the request is sent.
 */
export function authHeader(token: AuthToken): {
  /** The value of the header, such as `Bearer` followed by the token. */
  readonly authorization: Secret;
} {
  return { authorization: token.accessToken.withPrefix(`${token.tokenType} `) };
}

type TokenForm = Readonly<Record<string, string | Secret>>;

function passwordGrant({ username, password, storeId }: Credentials): TokenForm {
  return {
    grant_type: "password",
    username,
    password,
    scope: "offline_access",
    ...(storeId === undefined ? {} : { storeId }),
  };
}

function toAuthToken(response: HttpResponse, requestedAt: number): AuthToken {
  const body = response.parse(tokenResponseSchema);
  return {
    accessToken: body.access_token,
    tokenType: body.token_type,
    expiresAt: requestedAt + body.expires_in * 1_000,
    refreshToken: body.refresh_token,
  };
}
