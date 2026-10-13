import type { APIRequestContext } from "@playwright/test";
import type { AuthStub } from "./auth-stub";

import { expect, test } from "@playwright/test";

import { authHeader, TokenClient } from "@api/auth/token-client";
import { HttpClient } from "@api/http/http-client";
import { HttpError } from "@api/http/http-error";
import { MASK, Secret } from "@core/secret";

import { capturedWarnings } from "../../captured-warnings";
import { startAuthStub, WRONG_PASSWORD } from "./auth-stub";

const STORE_ID = "store-acme";
const PASSWORD = new Secret("token-client-password-1");

let stub: AuthStub;
let context: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  stub = await startAuthStub();
  context = await playwright.request.newContext({ baseURL: stub.baseUrl });
});

test.afterAll(async () => {
  await context.dispose();
  await stub.close();
});

function tokenClient(): TokenClient {
  return new TokenClient(new HttpClient(context), STORE_ID);
}

function user(prefix: string): string {
  return `${prefix}-${test.info().testId}`;
}

async function failure(promise: Promise<unknown>): Promise<HttpError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof HttpError)) {
    throw new Error(`expected an HttpError, got ${String(error)}`);
  }
  return error;
}

test.describe("TokenClient", () => {
  test.describe("signIn", () => {
    test("sends a password grant for the store and returns the token", async () => {
      const username = user("plain");
      const before = Date.now();

      const token = await tokenClient().signIn({ username, password: PASSWORD });

      expect(stub.lastForm()).toEqual({
        grant_type: "password",
        username,
        password: PASSWORD.reveal(),
        storeId: STORE_ID,
        scope: "offline_access",
      });
      expect(token.accessToken.reveal()).toBe(`1:${username}:access`);
      expect(token.tokenType).toBe("Bearer");
      expect(token.refreshToken?.reveal()).toBe(`1:${username}:refresh`);
      expect(token.expiresAt).toBeGreaterThanOrEqual(before + 3_600_000);
      expect(token.expiresAt).toBeLessThanOrEqual(Date.now() + 3_600_000);
    });

    test("never prints the tokens", async () => {
      const username = user("plain");

      const token = await tokenClient().signIn({ username, password: PASSWORD });

      expect(JSON.stringify(token)).not.toContain(username);
    });

    test("has no refresh token when the platform issues none", async () => {
      const token = await tokenClient().signIn({ username: user("norefresh"), password: PASSWORD });

      expect(token.refreshToken).toBeUndefined();
    });

    test("repeats a sign-in that failed with 500, warning about the retry", async () => {
      const username = user("flaky");
      const warnings = capturedWarnings();

      await tokenClient()
        .signIn({ username, password: PASSWORD })
        .finally(() => warnings.stop());

      expect(stub.passwordGrants(username)).toBe(2);
      expect(warnings.messages).toEqual([
        expect.stringMatching(/^POST http:\S+\/connect\/token → 500, retrying in \d+ ms$/),
      ]);
    });

    test("fails at once for another server error, such as an unavailable platform", async () => {
      const username = user("unavailable");
      const warnings = capturedWarnings();

      const error = await failure(tokenClient().signIn({ username, password: PASSWORD })).finally(() =>
        warnings.stop(),
      );

      expect(error.status).toBe(503);
      expect(stub.passwordGrants(username)).toBe(1);
      expect(warnings.messages).toEqual([]);
    });

    test("throws a client error at once, without repeating", async () => {
      const username = user("plain");

      const error = await failure(tokenClient().signIn({ username, password: new Secret(WRONG_PASSWORD) }));

      expect(error.status).toBe(400);
      expect(stub.passwordGrants(username)).toBe(1);
    });

    test("throws for a malformed token response without revealing the token in it", async () => {
      const username = user("malformed");

      const error = await failure(tokenClient().signIn({ username, password: PASSWORD }));

      expect(error.message).toContain("unexpected response body");
      expect(error.message).toContain(`"access_token":"${MASK}"`);
      expect(error.message).not.toContain(`1:${username}:access`);
    });
  });

  test.describe("requestPasswordGrant", () => {
    test("returns a rejection as it is", async () => {
      const response = await tokenClient().requestPasswordGrant({
        username: user("plain"),
        password: new Secret(WRONG_PASSWORD),
      });

      expect(response.status).toBe(400);
    });

    test("sends extra fields, which win over the standard ones", async () => {
      const username = user("plain");

      await tokenClient().requestPasswordGrant(
        { username, password: PASSWORD },
        { organization_id: "organization-1", storeId: "store-other" },
      );

      expect(stub.lastForm()).toMatchObject({ username, organization_id: "organization-1", storeId: "store-other" });
    });

    test("does not repeat a server error", async () => {
      const username = user("flaky");

      const response = await tokenClient().requestPasswordGrant({ username, password: PASSWORD });

      expect(response.status).toBe(500);
      expect(stub.passwordGrants(username)).toBe(1);
    });
  });

  test.describe("refresh", () => {
    test("returns a new token for a valid refresh token", async () => {
      const username = user("plain");
      const { refreshToken } = await tokenClient().signIn({ username, password: PASSWORD });
      if (refreshToken === undefined) {
        throw new Error("the stub issued no refresh token");
      }

      const refreshed = await tokenClient().refresh(refreshToken);

      expect(stub.lastForm()).toEqual({ grant_type: "refresh_token", refresh_token: refreshToken.reveal() });
      expect(refreshed?.accessToken.reveal()).toBe(`101:${username}:access`);
    });

    test("returns undefined when the platform rejects the refresh token", async () => {
      expect(await tokenClient().refresh(new Secret(`1:${user("rejected")}:refresh`))).toBeUndefined();
    });
  });

  test.describe("revoke", () => {
    test("sends the token in the authorization header", async () => {
      const token = await tokenClient().signIn({ username: user("plain"), password: PASSWORD });

      await tokenClient().revoke(token);

      expect(stub.revokedTokens).toContain(token.accessToken.reveal());
    });

    test("throws when the platform refuses", async () => {
      const token = await tokenClient().signIn({ username: user("unrevokable"), password: PASSWORD });

      expect((await failure(tokenClient().revoke(token))).status).toBe(500);
    });
  });

  test("builds the authorization header from the token type and value", () => {
    const token = { accessToken: new Secret("abc"), tokenType: "Bearer", expiresAt: 0, refreshToken: undefined };

    expect(authHeader(token)).toEqual({ Authorization: "Bearer abc" });
  });
});
