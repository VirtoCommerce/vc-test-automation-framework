import type { APIRequestContext } from "@playwright/test";
import type { Credentials } from "@api/auth/credentials";
import type { Authentication } from "@api/http/http-client";
import type { AuthStub } from "./auth-stub";

import { expect, test } from "@playwright/test";

import { TokenClient } from "@api/auth/token-client";
import { TokenManager } from "@api/auth/token-manager";
import { HttpClient } from "@api/http/http-client";
import { HttpError } from "@api/http/http-error";
import { Secret } from "@core/secret";

import { capturedWarnings } from "../../captured-warnings";
import { startAuthStub, WRONG_PASSWORD } from "./auth-stub";

const PASSWORD = new Secret("token-manager-password-1");

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

function tokenManager(): TokenManager {
  return new TokenManager(new TokenClient(new HttpClient(context), "store-acme"));
}

function credentials(flags: string, password: Secret = PASSWORD): Credentials {
  return { username: `${flags}-${test.info().testId}`, password };
}

async function recordedAuthentication(manager: TokenManager, user: Credentials): Promise<Authentication> {
  let recorded: Authentication | undefined;
  const recorder = {
    withAuthentication: (authentication: Authentication) => {
      recorded = authentication;
      return recorder;
    },
  } as unknown as HttpClient;
  await manager.signedIn(recorder, user);
  if (recorded === undefined) {
    throw new Error("signedIn added no authentication");
  }
  return recorded;
}

test.describe("TokenManager", () => {
  test.describe("token", () => {
    test("signs in once and reuses the token", async () => {
      const manager = tokenManager();
      const user = credentials("plain");

      const first = await manager.token(user);
      const second = await manager.token(user);

      expect(second).toBe(first);
      expect(stub.passwordGrants(user.username)).toBe(1);
    });

    test("shares one sign-in between concurrent requests", async () => {
      const manager = tokenManager();
      const user = credentials("plain");

      const tokens = await Promise.all([manager.token(user), manager.token(user), manager.token(user)]);

      expect(new Set(tokens).size).toBe(1);
      expect(stub.passwordGrants(user.username)).toBe(1);
    });

    test("refreshes a token that is about to expire", async () => {
      const manager = tokenManager();
      const user = credentials("short");
      const first = await manager.token(user);

      const renewed = await manager.token(user);

      expect(renewed.accessToken.reveal()).not.toBe(first.accessToken.reveal());
      expect(stub.refreshGrants(user.username)).toBe(1);
      expect(stub.passwordGrants(user.username)).toBe(1);
    });

    test("refreshes once for concurrent requests", async () => {
      const manager = tokenManager();
      const user = credentials("short");
      await manager.token(user);

      await Promise.all([manager.token(user), manager.token(user), manager.token(user)]);

      expect(stub.refreshGrants(user.username)).toBe(1);
    });

    test("signs in again when the refresh is rejected", async () => {
      const manager = tokenManager();
      const user = credentials("short-rejected");
      await manager.token(user);

      await manager.token(user);

      expect(stub.refreshGrants(user.username)).toBe(1);
      expect(stub.passwordGrants(user.username)).toBe(2);
    });

    test("signs in again when the token has no refresh token", async () => {
      const manager = tokenManager();
      const user = credentials("short-norefresh");
      await manager.token(user);

      await manager.token(user);

      expect(stub.refreshGrants(user.username)).toBe(0);
      expect(stub.passwordGrants(user.username)).toBe(2);
    });

    test("does not keep a failed sign-in", async () => {
      const manager = tokenManager();
      const user = credentials("plain", new Secret(WRONG_PASSWORD));

      await expect(manager.token(user)).rejects.toBeInstanceOf(HttpError);
      await expect(manager.token(user)).rejects.toBeInstanceOf(HttpError);

      expect(stub.passwordGrants(user.username)).toBe(2);
    });

    test("signs in again and revokes the previous token after the password changed", async () => {
      const manager = tokenManager();
      const user = credentials("plain");
      const previous = await manager.token(user);

      await manager.token({ ...user, password: new Secret("token-manager-password-2") });

      expect(stub.passwordGrants(user.username)).toBe(2);
      expect(stub.revokedTokens).toContain(previous.accessToken.reveal());
    });

    test("still signs in with the new password when the previous token cannot be revoked", async () => {
      const manager = tokenManager();
      const user = credentials("unrevokable");
      await manager.token(user);
      const warnings = capturedWarnings();

      try {
        await manager.token({ ...user, password: new Secret("token-manager-password-2") });
        await new Promise((resolve) => setImmediate(resolve));
      } finally {
        warnings.stop();
      }

      expect(stub.passwordGrants(user.username)).toBe(2);
      expect(warnings.messages).toEqual([
        expect.stringContaining(`could not revoke the previous token of ${user.username}`),
      ]);
    });
  });

  test.describe("signedIn", () => {
    test("returns a client that sends the current token", async () => {
      const manager = tokenManager();
      const user = credentials("plain");

      const client = await manager.signedIn(new HttpClient(context), user);
      const echo = (await client.get("/echo")).json<{ authorization: string }>();

      expect(echo.authorization).toBe(`Bearer ${(await manager.token(user)).accessToken.reveal()}`);
    });

    test("sends the renewed token after the token is renewed", async () => {
      const manager = tokenManager();
      const user = credentials("short");
      const client = await manager.signedIn(new HttpClient(context), user);

      const echo = (await client.get("/echo")).json<{ authorization: string }>();

      expect(stub.refreshGrants(user.username)).toBe(1);
      expect(echo.authorization).toMatch(/^Bearer 101:/);
    });

    test("fails at once for a wrong password", async () => {
      const user = credentials("plain", new Secret(WRONG_PASSWORD));

      await expect(tokenManager().signedIn(new HttpClient(context), user)).rejects.toBeInstanceOf(HttpError);
    });

    test("signs in again and repeats the request after the platform ended the user's sessions", async () => {
      const manager = tokenManager();
      const user = credentials("plain");
      const client = await manager.signedIn(new HttpClient(context), user);
      expect((await client.get("/protected")).status).toBe(200);

      stub.endSessions(user.username);
      const response = await client.get("/protected");

      expect(response.status).toBe(200);
      expect(stub.passwordGrants(user.username)).toBe(2);
    });

    test("shares one new sign-in between concurrent rejected requests", async () => {
      const manager = tokenManager();
      const user = credentials("plain");
      const client = await manager.signedIn(new HttpClient(context), user);
      stub.endSessions(user.username);

      const responses = await Promise.all(Array.from({ length: 5 }, () => client.get("/protected")));

      expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 200, 200]);
      expect(stub.passwordGrants(user.username)).toBe(2);
    });

    test("never hands out a rejected token again, even when another request asks for it during the renewal", async () => {
      const manager = tokenManager();
      const user = credentials("plain");
      const { headers, renew } = await recordedAuthentication(manager, user);
      const rejectedHeaders = await headers();

      const renewal = renew(rejectedHeaders);
      const concurrent = manager.token(user);
      await Promise.all([renewal, concurrent]);

      expect(await headers()).not.toEqual(rejectedHeaders);
      expect(stub.passwordGrants(user.username)).toBe(2);
    });

    test("returns the 401 when the token of the new sign-in is refused too", async () => {
      const manager = tokenManager();
      const user = credentials("banned");
      const client = await manager.signedIn(new HttpClient(context), user);

      const response = await client.get("/protected");

      expect(response.status).toBe(401);
      expect(stub.passwordGrants(user.username)).toBe(2);
    });
  });

  test.describe("signOut", () => {
    test("revokes the token and signs in afresh next time", async () => {
      const manager = tokenManager();
      const user = credentials("plain");
      const token = await manager.token(user);

      await manager.signOut(user.username);
      await manager.token(user);

      expect(stub.revokedTokens).toContain(token.accessToken.reveal());
      expect(stub.passwordGrants(user.username)).toBe(2);
    });

    test("does not revoke a token that is about to expire", async () => {
      const manager = tokenManager();
      const user = credentials("short");
      const token = await manager.token(user);

      await manager.signOut(user.username);

      expect(stub.revokedTokens).not.toContain(token.accessToken.reveal());
    });

    test("does not revoke a token the platform rejected", async () => {
      const manager = tokenManager();
      const user = credentials("plain");
      const { headers, renew } = await recordedAuthentication(manager, user);
      const rejected = await manager.token(user);
      await renew(await headers());

      await manager.signOut(user.username);

      expect(stub.revokedTokens).not.toContain(rejected.accessToken.reveal());
    });

    test("does nothing for a user who is not signed in", async () => {
      await expect(tokenManager().signOut("nobody")).resolves.toBeUndefined();
    });

    test("forgets the token even when the platform refuses the revocation", async () => {
      const manager = tokenManager();
      const user = credentials("unrevokable");
      await manager.token(user);

      await expect(manager.signOut(user.username)).rejects.toBeInstanceOf(HttpError);
      await manager.token(user);

      expect(stub.passwordGrants(user.username)).toBe(2);
    });
  });

  test("signs everyone out and reports the first failure after trying all", async () => {
    const manager = tokenManager();
    const kept = await manager.token(credentials("slow"));
    await manager.token(credentials("unrevokable"));

    await expect(manager.signOutAll()).rejects.toThrow("revocation failed");

    expect(stub.revokedTokens).toContain(kept.accessToken.reveal());
  });
});
