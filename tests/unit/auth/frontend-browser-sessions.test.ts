import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { APIRequestContext } from "@playwright/test";
import type { StorageState } from "@/auth";

import { createServer } from "node:http";

import { expect, request, test } from "@playwright/test";

import { FrontendBrowserSessions } from "@/auth";
import { Secret } from "@/core";

type Received = { readonly host: string; readonly path: string; readonly form: Readonly<Record<string, string>> };

const ALICE = { username: "alice@example.com", password: Secret.of("Alice-Password-1"), storeId: "store-a" };
const BOB = { username: "bob@example.com", password: Secret.of("Bob-Password-1"), storeId: "store-a" };

let server: Server;
let frontendUrl: string;
let otherOriginUrl: string;
let sessions: FrontendBrowserSessions;
let contexts: APIRequestContext[] = [];
let received: Received[] = [];
let issued = 0;
let revokeStatus = 200;

test.beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  frontendUrl = `http://127.0.0.1:${port}/`;
  otherOriginUrl = `http://localhost:${port}/`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  contexts = [];
  received = [];
  issued = 0;
  revokeStatus = 200;
  sessions = new FrontendBrowserSessions({ newContext });
});

test.afterEach(async () => {
  revokeStatus = 200;
  await sessions.dispose();
});

test.describe("FrontendBrowserSessions.signedIn", () => {
  test("puts the user's token into the local storage of the frontend's origin", async () => {
    const before = Date.now();
    const state = await sessions.signedIn(`${frontendUrl}en-us/catalog`, ALICE);

    expect(state.cookies).toEqual([]);
    expect(state.origins).toHaveLength(1);
    expect(state.origins[0]?.origin).toBe(new URL(frontendUrl).origin);
    expect(state.origins[0]?.localStorage.map((item) => item.name)).toEqual(["auth"]);
    const entry = tokenEntryOf(state, "auth");
    expect(entry).toEqual({
      expires_at: expect.any(String),
      token_type: "Bearer",
      access_token: "Access-Token-1",
      refresh_token: "Refresh-Token-1",
    });
    expect(Date.parse(String(entry["expires_at"]))).toBeGreaterThanOrEqual(before + 1_800_000 - 1_000);
  });

  test("requests the token through the frontend, with the user's store", async () => {
    await sessions.signedIn(frontendUrl, ALICE);

    expect(received).toEqual([
      {
        host: new URL(frontendUrl).host,
        path: "/connect/token",
        form: expect.objectContaining({ grant_type: "password", username: ALICE.username, storeId: "store-a" }),
      },
    ]);
  });

  test("reuses the token of a user and shares one sign-in among concurrent calls", async () => {
    const [first, second] = await Promise.all([
      sessions.signedIn(frontendUrl, ALICE),
      sessions.signedIn(frontendUrl, ALICE),
    ]);
    const third = await sessions.signedIn(frontendUrl, ALICE);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(passwordGrants()).toBe(1);
  });

  test("creates one request context for each frontend origin", async () => {
    await sessions.signedIn(frontendUrl, ALICE);
    await sessions.signedIn(`${frontendUrl}account`, BOB);
    const other = await sessions.signedIn(otherOriginUrl, ALICE);

    expect(contexts).toHaveLength(2);
    expect(other.origins[0]?.origin).toBe(new URL(otherOriginUrl).origin);
    expect(passwordGrants()).toBe(3);
  });

  test("uses the storage keys of the options", async () => {
    sessions = new FrontendBrowserSessions({
      newContext,
      storageKeys: { token: "session", anonymousUserId: "visitor" },
    });

    const signedIn = await sessions.signedIn(frontendUrl, ALICE);
    const anonymous = sessions.anonymous(frontendUrl, "visitor-1");

    expect(signedIn.origins[0]?.localStorage.map((item) => item.name)).toEqual(["session"]);
    expect(anonymous.origins[0]?.localStorage).toEqual([{ name: "visitor", value: "visitor-1" }]);
  });

  test("fails when the frontend refuses the sign-in, and does not keep the failure", async () => {
    const wrong = { ...ALICE, password: Secret.of("Wrong-Password-1") };

    await expect(sessions.signedIn(frontendUrl, wrong)).rejects.toThrow(expect.objectContaining({ status: 400 }));
    await expect(sessions.signedIn(frontendUrl, ALICE)).resolves.toBeDefined();
    expect(passwordGrants()).toBe(2);
  });
});

test.describe("FrontendBrowserSessions.anonymous", () => {
  test("puts the visitor's identifier into the local storage without sending requests", () => {
    const state = sessions.anonymous(`${frontendUrl}cart`, "visitor-1");

    expect(state).toEqual({
      cookies: [],
      origins: [{ origin: new URL(frontendUrl).origin, localStorage: [{ name: "user-id", value: "visitor-1" }] }],
    });
    expect(received).toEqual([]);
    expect(contexts).toEqual([]);
  });
});

test.describe("FrontendBrowserSessions.signOut", () => {
  test("revokes the user's token on every frontend, and the next call signs in again", async () => {
    await sessions.signedIn(frontendUrl, ALICE);
    await sessions.signedIn(otherOriginUrl, ALICE);
    await sessions.signedIn(frontendUrl, BOB);

    await sessions.signOut(ALICE);
    await sessions.signedIn(frontendUrl, ALICE);

    expect(revocations()).toBe(2);
    expect(passwordGrants()).toBe(4);
  });
});

test.describe("FrontendBrowserSessions.dispose", () => {
  test("revokes every token and disposes of the request contexts", async () => {
    await sessions.signedIn(frontendUrl, ALICE);
    await sessions.signedIn(otherOriginUrl, BOB);

    await sessions.dispose();

    expect(revocations()).toBe(2);
    for (const context of contexts) {
      await expect(context.get(frontendUrl)).rejects.toThrow();
    }
  });

  test("disposes of every context when a frontend does not confirm the sign-out", async () => {
    await sessions.signedIn(frontendUrl, ALICE);
    revokeStatus = 500;

    await expect(sessions.dispose()).rejects.toThrow(expect.objectContaining({ status: 500 }));
    expect(contexts).toHaveLength(1);
    for (const context of contexts) {
      await expect(context.get(frontendUrl)).rejects.toThrow();
    }
  });

  test("reports every frontend that does not confirm the sign-out", async () => {
    await sessions.signedIn(frontendUrl, ALICE);
    await sessions.signedIn(otherOriginUrl, ALICE);
    revokeStatus = 500;

    await expect(sessions.dispose()).rejects.toThrow(AggregateError);
  });
});

async function newContext(): Promise<APIRequestContext> {
  const context = await request.newContext();
  contexts.push(context);
  return context;
}

function tokenEntryOf(state: StorageState, name: string): Record<string, unknown> {
  const value = state.origins[0]?.localStorage.find((item) => item.name === name)?.value;
  return JSON.parse(value ?? "null");
}

function passwordGrants(): number {
  return received.filter((item) => item.form["grant_type"] === "password").length;
}

function revocations(): number {
  return received.filter((item) => item.path === "/revoke/token").length;
}

function handle(incoming: IncomingMessage, outgoing: ServerResponse): void {
  const chunks: Buffer[] = [];
  incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
  incoming.on("end", () => {
    const item: Received = {
      host: incoming.headers.host ?? "",
      path: incoming.url ?? "",
      form: Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString())),
    };
    received.push(item);
    const { status, body } = respond(item);
    outgoing.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  });
}

function respond(item: Received): { readonly status: number; readonly body: unknown } {
  if (item.path === "/revoke/token") {
    return { status: revokeStatus, body: {} };
  }
  if (item.path === "/connect/token" && item.form["password"]?.startsWith("Wrong") === true) {
    return { status: 400, body: { error: "invalid_grant" } };
  }
  if (item.path === "/connect/token") {
    issued += 1;
    return {
      status: 200,
      body: {
        access_token: `Access-Token-${issued}`,
        token_type: "Bearer",
        expires_in: 1_800,
        refresh_token: `Refresh-Token-${issued}`,
      },
    };
  }
  return { status: 404, body: {} };
}
