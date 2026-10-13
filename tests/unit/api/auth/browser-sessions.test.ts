import type { APIRequestContext } from "@playwright/test";
import type { Credentials } from "@api/auth/credentials";
import type { AuthStub } from "./auth-stub";

import { expect, test } from "@playwright/test";

import { BrowserSessions } from "@api/auth/browser-sessions";
import { TokenClient } from "@api/auth/token-client";
import { TokenManager } from "@api/auth/token-manager";
import { HttpClient } from "@api/http/http-client";
import { Secret } from "@core/secret";

import { startAuthStub, WRONG_PASSWORD } from "./auth-stub";

const FRONTEND_BASE_URL = "https://frontend.example.com";
const PASSWORD = new Secret("browser-sessions-password-1");

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

function setup(newBackendContext: () => Promise<APIRequestContext>): {
  readonly sessions: BrowserSessions;
  readonly tokens: TokenManager;
} {
  const tokens = new TokenManager(new TokenClient(new HttpClient(context), "store-acme"));
  return { tokens, sessions: new BrowserSessions(tokens, { frontendBaseUrl: FRONTEND_BASE_URL, newBackendContext }) };
}

function credentials(flags: string, password: Secret = PASSWORD): Credentials {
  return { username: `${flags}-${test.info().testId}`, password };
}

test.describe("BrowserSessions", () => {
  test.describe("anonymous", () => {
    test("stores the visitor id for the frontend origin", ({ playwright }) => {
      const { sessions } = setup(() => playwright.request.newContext());

      expect(sessions.anonymous("frontend", "anonymous-1")).toEqual({
        cookies: [],
        origins: [{ origin: FRONTEND_BASE_URL, localStorage: [{ name: "user-id", value: "anonymous-1" }] }],
      });
    });

    test("is a new empty state for the admin UI every time", ({ playwright }) => {
      const { sessions } = setup(() => playwright.request.newContext());

      const first = sessions.anonymous("backend", "anonymous-1");
      const second = sessions.anonymous("backend", "anonymous-1");

      expect(first).toEqual({ cookies: [], origins: [] });
      expect(second).not.toBe(first);
    });
  });

  test("stores the frontend token where the frontend reads it", async ({ playwright }) => {
    const { sessions, tokens } = setup(() => playwright.request.newContext());
    const user = credentials("plain");

    const state = await sessions.signedIn("frontend", user);

    const token = await tokens.token(user);
    expect(state.cookies).toEqual([]);
    expect(state.origins).toEqual([{ origin: FRONTEND_BASE_URL, localStorage: [expect.anything()] }]);
    const [entry] = state.origins[0]?.localStorage ?? [];
    expect(entry?.name).toBe("auth");
    expect(JSON.parse(entry?.value ?? "null")).toEqual({
      expires_at: new Date(token.expiresAt).toISOString(),
      token_type: "Bearer",
      access_token: token.accessToken.reveal(),
      refresh_token: token.refreshToken?.reveal(),
    });
  });

  test.describe("admin UI", () => {
    test("signs in with a cookie once and reuses the state", async ({ playwright }) => {
      const { sessions } = setup(() => playwright.request.newContext({ baseURL: stub.baseUrl }));
      const user = credentials("admin");

      const first = await sessions.signedIn("backend", user);
      const second = await sessions.signedIn("backend", user);

      expect(first.cookies).toEqual([
        expect.objectContaining({ name: ".VirtoCommerce.Identity.Application", value: `session-${user.username}` }),
      ]);
      expect(second).toBe(first);
      expect(stub.logins(user.username)).toBe(1);
    });

    test("shares one sign-in between concurrent requests", async ({ playwright }) => {
      const { sessions } = setup(() => playwright.request.newContext({ baseURL: stub.baseUrl }));
      const user = credentials("admin");

      const [first, second] = await Promise.all([
        sessions.signedIn("backend", user),
        sessions.signedIn("backend", user),
      ]);

      expect(second).toBe(first);
      expect(stub.logins(user.username)).toBe(1);
    });

    test("signs in again after the password changed", async ({ playwright }) => {
      const { sessions } = setup(() => playwright.request.newContext({ baseURL: stub.baseUrl }));
      const user = credentials("admin");
      await sessions.signedIn("backend", user);

      await sessions.signedIn("backend", { ...user, password: new Secret("browser-sessions-password-2") });

      expect(stub.logins(user.username)).toBe(2);
    });

    for (const [flags, password, reason] of [
      ["admin", new Secret(WRONG_PASSWORD), "wrong user name or password"],
      ["locked", PASSWORD, "the user is locked out"],
      ["notallowed", PASSWORD, "the user is not allowed to sign in"],
      ["twofactor", PASSWORD, "the user requires two-factor authentication"],
    ] as const) {
      test(`names the reason when the platform refuses: ${reason}`, async ({ playwright }) => {
        const { sessions } = setup(() => playwright.request.newContext({ baseURL: stub.baseUrl }));
        const user = credentials(flags, password);

        await expect(sessions.signedIn("backend", user)).rejects.toThrow(
          `Platform sign-in as ${user.username} failed: ${reason}`,
        );
      });
    }

    test("does not keep a refused sign-in", async ({ playwright }) => {
      const { sessions } = setup(() => playwright.request.newContext({ baseURL: stub.baseUrl }));
      const user = credentials("locked");

      await expect(sessions.signedIn("backend", user)).rejects.toThrow();
      await expect(sessions.signedIn("backend", user)).rejects.toThrow();

      expect(stub.logins(user.username)).toBe(2);
    });

    test("disposes of every request context it creates", async ({ playwright }) => {
      const created: APIRequestContext[] = [];
      const { sessions } = setup(async () => {
        const backend = await playwright.request.newContext({ baseURL: stub.baseUrl });
        created.push(backend);
        return backend;
      });

      await sessions.signedIn("backend", credentials("admin"));
      await sessions.signedIn("backend", credentials("locked")).catch(() => undefined);

      expect(created).toHaveLength(2);
      for (const backend of created) {
        await expect(backend.get("/echo")).rejects.toThrow(/has been closed/);
      }
    });
  });

  test.describe("signOut", () => {
    test("signs in to the admin UI again next time", async ({ playwright }) => {
      const { sessions } = setup(() => playwright.request.newContext({ baseURL: stub.baseUrl }));
      const user = credentials("admin");
      await sessions.signedIn("backend", user);

      await sessions.signOut(user.username);
      await sessions.signedIn("backend", user);

      expect(stub.logins(user.username)).toBe(2);
    });

    test("revokes the frontend token", async ({ playwright }) => {
      const { sessions, tokens } = setup(() => playwright.request.newContext());
      const user = credentials("plain");
      await sessions.signedIn("frontend", user);
      const token = await tokens.token(user);

      await sessions.signOut(user.username);

      expect(stub.revokedTokens).toContain(token.accessToken.reveal());
    });
  });
});
