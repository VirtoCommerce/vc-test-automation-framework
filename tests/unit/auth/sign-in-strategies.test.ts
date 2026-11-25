import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { APIRequestContext } from "@playwright/test";
import type { SignInStrategy, StorageState } from "@/auth";

import { createServer } from "node:http";

import { expect, request, test } from "@playwright/test";

import { anonymousVisitorState, BrowserSessions, cookieSignIn, oauthLocalStorage, platformAdminSignIn } from "@/auth";
import { Secret } from "@/core";

type Received = {
  readonly host: string;
  readonly path: string;
  readonly cookie: string;
  readonly body: Readonly<Record<string, unknown>>;
};

const ALICE = { username: "alice@example.com", password: Secret.of("Alice-Password-1"), storeId: "store-a" };
const ADMIN = { username: "admin", password: Secret.of("Admin-Password-1") };
const SESSION_MAX_AGE_S = 1_800;

let server: Server;
let appUrl: string;
let otherOriginUrl: string;
let contexts: APIRequestContext[] = [];
let received: Received[] = [];
let issued = 0;
let revokeStatus = 200;
let platformResult: Record<string, unknown> | undefined;
let sessions: BrowserSessions | undefined;

test.beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  appUrl = `http://127.0.0.1:${port}`;
  otherOriginUrl = `http://localhost:${port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  contexts = [];
  received = [];
  issued = 0;
  revokeStatus = 200;
  platformResult = undefined;
  sessions = undefined;
});

test.afterEach(async () => {
  revokeStatus = 200;
  await sessions?.dispose();
});

test.describe("oauthLocalStorage", () => {
  test("requests the token through the application's origin, with the user's store", async () => {
    await sessionsWith(oauthLocalStorage()).signedIn(`${appUrl}/en-us/catalog`, ALICE);

    expect(received).toEqual([
      {
        host: new URL(appUrl).host,
        path: "/connect/token",
        cookie: "",
        body: expect.objectContaining({ grant_type: "password", username: ALICE.username, storeId: "store-a" }),
      },
    ]);
  });

  test("puts the token into local storage in the format of the Virto Commerce frontend", async () => {
    const before = Date.now();

    const state = await sessionsWith(oauthLocalStorage()).signedIn(appUrl, ALICE);

    expect(state.cookies).toEqual([]);
    expect(state.origins.map(({ origin }) => origin)).toEqual([appUrl]);
    const entry = localStorageEntry(state, "auth");
    expect(entry).toEqual({
      expires_at: expect.any(String),
      token_type: "Bearer",
      access_token: "Access-Token-1",
      refresh_token: "Refresh-Token-1",
    });
    expect(Date.parse(String(entry["expires_at"]))).toBeGreaterThanOrEqual(before + SESSION_MAX_AGE_S * 1_000 - 1_000);
  });

  test("uses the storage key and the endpoints of the options", async () => {
    const browserSessions = sessionsWith(
      oauthLocalStorage({ storageKey: "session", tokenPath: "/oauth/token", revokePath: "/oauth/revoke" }),
    );

    const state = await browserSessions.signedIn(appUrl, ALICE);
    await browserSessions.signOut(ALICE);

    expect(state.origins[0]?.localStorage.map(({ name }) => name)).toEqual(["session"]);
    expect(received.map(({ path }) => path)).toEqual(["/oauth/token", "/oauth/revoke"]);
  });

  test("revokes the token when the session is signed out", async () => {
    const browserSessions = sessionsWith(oauthLocalStorage());
    await browserSessions.signedIn(appUrl, ALICE);
    await browserSessions.signedIn(otherOriginUrl, ALICE);

    await browserSessions.signOut(ALICE);

    expect(received.filter(({ path }) => path === "/revoke/token")).toHaveLength(2);
  });

  test("fails when the application refuses the sign-in", async () => {
    const wrong = { ...ALICE, password: Secret.of("Wrong-Password-1") };

    await expect(sessionsWith(oauthLocalStorage()).signedIn(appUrl, wrong)).rejects.toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });

  test("fails to dispose when the application does not confirm the revocation", async () => {
    const browserSessions = sessionsWith(oauthLocalStorage());
    await browserSessions.signedIn(appUrl, ALICE);
    revokeStatus = 500;

    await expect(browserSessions.dispose()).rejects.toThrow(expect.objectContaining({ status: 500 }));
  });
});

test.describe("cookieSignIn", () => {
  const twoStep = cookieSignIn(
    async (http, { username, password, storeId }) => {
      (await http.post("/api/auth/login", { json: { username, password } })).expectOk();
      (await http.post("/api/auth/login-platform", { json: { username, password, storeId } })).expectOk();
    },
    { signOut: async (http) => (await http.post("/api/auth/logout")).expectOk() },
  );

  test("keeps the cookies of every sign-in request, and sends the first one's cookies with the next", async () => {
    const state = await sessionsWith(twoStep).signedIn(appUrl, ALICE);

    expect(received.map(({ path, cookie }) => ({ path, cookie }))).toEqual([
      { path: "/api/auth/login", cookie: "" },
      { path: "/api/auth/login-platform", cookie: "accessToken=alice@example.com-1" },
    ]);
    expect(received[0]?.body).toEqual({ username: ALICE.username, password: "Alice-Password-1" });
    expect(state.cookies.map(({ name }) => name).toSorted()).toEqual(["accessToken", "platformAccessToken"]);
  });

  test("expires with the first cookie that has an expiry", async () => {
    const browserSessions = sessionsWith(twoStep);
    await browserSessions.signedIn(appUrl, ALICE);

    await browserSessions.signedIn(appUrl, ALICE);

    expect(received.filter(({ path }) => path === "/api/auth/login")).toHaveLength(2);
    expect(received.filter(({ path }) => path === "/api/auth/logout")).toHaveLength(0);
  });

  test("signs out with the session's cookies", async () => {
    const browserSessions = sessionsWith(twoStep);
    await browserSessions.signedIn(appUrl, { ...ALICE, storeId: "store-b" });

    await browserSessions.signOut({ ...ALICE, storeId: "store-b" });

    expect(received.at(-1)).toEqual(
      expect.objectContaining({ path: "/api/auth/logout", cookie: expect.stringContaining("platformAccessToken=") }),
    );
  });

  test("fails when a sign-in request fails", async () => {
    const wrong = { ...ALICE, password: Secret.of("Wrong-Password-1") };

    await expect(sessionsWith(twoStep).signedIn(appUrl, wrong)).rejects.toThrow(
      expect.objectContaining({ status: 401 }),
    );
  });
});

test.describe("platformAdminSignIn", () => {
  test("signs in with the user's password and returns the sign-in cookie", async () => {
    const state = await sessionsWith(platformAdminSignIn).signedIn(appUrl, ADMIN);

    expect(received).toEqual([
      {
        host: new URL(appUrl).host,
        path: "/api/platform/security/login",
        cookie: "",
        body: { userName: "admin", password: "Admin-Password-1" },
      },
    ]);
    expect(state.cookies).toEqual([
      expect.objectContaining({ name: ".AspNetCore.Identity.Application", value: "admin-session" }),
    ]);
  });

  test("keeps the session, which the platform cannot end, until it is signed out", async () => {
    const browserSessions = sessionsWith(platformAdminSignIn);
    await browserSessions.signedIn(appUrl, ADMIN);
    await browserSessions.signedIn(appUrl, ADMIN);

    await browserSessions.signOut(ADMIN);
    await browserSessions.signedIn(appUrl, ADMIN);

    expect(received.map(({ path }) => path)).toEqual(Array(2).fill("/api/platform/security/login"));
  });

  for (const [result, reason] of [
    [{ succeeded: false, isLockedOut: true }, "the user is locked out"],
    [{ succeeded: false, isNotAllowed: true }, "the user is not allowed to sign in"],
    [{ succeeded: false, requiresTwoFactor: true }, "the user needs two-factor authentication"],
    [{ succeeded: false }, "the user name or password is wrong"],
  ] as const) {
    test(`fails with the reason when ${reason}`, async () => {
      platformResult = result;

      await expect(sessionsWith(platformAdminSignIn).signedIn(appUrl, ADMIN)).rejects.toThrow(
        `Signing in to the platform as admin failed: ${reason}`,
      );
    });
  }
});

test.describe("anonymousVisitorState", () => {
  test("puts the visitor's identifier into the local storage of the frontend's origin", () => {
    expect(anonymousVisitorState(`${appUrl}/cart`, "visitor-1")).toEqual({
      cookies: [],
      origins: [{ origin: appUrl, localStorage: [{ name: "user-id", value: "visitor-1" }] }],
    });
  });

  test("uses the storage key it is given", () => {
    expect(anonymousVisitorState(appUrl, "visitor-1", "visitor").origins[0]?.localStorage).toEqual([
      { name: "visitor", value: "visitor-1" },
    ]);
  });
});

function sessionsWith(strategy: SignInStrategy): BrowserSessions {
  sessions = new BrowserSessions({ newContext, strategy });
  return sessions;
}

async function newContext(): Promise<APIRequestContext> {
  const context = await request.newContext();
  contexts.push(context);
  return context;
}

function localStorageEntry(state: StorageState, name: string): Record<string, unknown> {
  const value = state.origins[0]?.localStorage.find((item) => item.name === name)?.value;
  return JSON.parse(value ?? "null");
}

function handle(incoming: IncomingMessage, outgoing: ServerResponse): void {
  const chunks: Buffer[] = [];
  incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
  incoming.on("end", () => {
    const text = Buffer.concat(chunks).toString();
    const item: Received = {
      host: incoming.headers.host ?? "",
      path: incoming.url ?? "",
      cookie: incoming.headers.cookie ?? "",
      body: parseBody(text, incoming.headers["content-type"] ?? ""),
    };
    received.push(item);
    const { status, body, cookies } = respond(item);
    outgoing
      .writeHead(status, {
        "content-type": "application/json",
        ...(cookies.length > 0 ? { "set-cookie": cookies } : {}),
      })
      .end(JSON.stringify(body));
  });
}

function parseBody(text: string, contentType: string): Readonly<Record<string, unknown>> {
  if (text === "") {
    return {};
  }
  return contentType.includes("json") ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text));
}

function respond(item: Received): { readonly status: number; readonly body: unknown; readonly cookies: string[] } {
  const wrong = String(item.body["password"] ?? "").startsWith("Wrong");
  switch (item.path) {
    case "/connect/token":
    case "/oauth/token":
      if (wrong) {
        return { status: 400, body: { error: "invalid_grant" }, cookies: [] };
      }
      issued += 1;
      return {
        status: 200,
        body: {
          access_token: `Access-Token-${issued}`,
          token_type: "Bearer",
          expires_in: SESSION_MAX_AGE_S,
          refresh_token: `Refresh-Token-${issued}`,
        },
        cookies: [],
      };
    case "/revoke/token":
    case "/oauth/revoke":
      return { status: revokeStatus, body: {}, cookies: [] };
    case "/api/auth/login":
      if (wrong) {
        return { status: 401, body: {}, cookies: [] };
      }
      issued += 1;
      return { status: 200, body: {}, cookies: [`accessToken=${item.body["username"]}-${issued}; Path=/; Max-Age=30`] };
    case "/api/auth/login-platform":
      return {
        status: 200,
        body: {},
        cookies: [`platformAccessToken=${item.body["storeId"]}; Path=/; Max-Age=${SESSION_MAX_AGE_S}`],
      };
    case "/api/auth/logout":
      return { status: 200, body: {}, cookies: [] };
    case "/api/platform/security/login": {
      const result = platformResult ?? { succeeded: true };
      const cookies =
        result["succeeded"] === true
          ? [`.AspNetCore.Identity.Application=${item.body["userName"]}-session; Path=/`]
          : [];
      return { status: 200, body: result, cookies };
    }
    default:
      return { status: 404, body: {}, cookies: [] };
  }
}
