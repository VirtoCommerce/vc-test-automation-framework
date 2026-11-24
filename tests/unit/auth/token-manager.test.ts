import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { APIRequestContext } from "@playwright/test";

import { createServer } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import { expect, request, test } from "@playwright/test";

import { TokenClient, TokenManager } from "@/auth";
import { Secret } from "@/core";
import { HttpClient } from "@/http";

type Received = {
  readonly path: string;
  readonly form: Readonly<Record<string, string>>;
  readonly authorization: string | undefined;
};

type Planned = { readonly status: number; readonly body: unknown };

const ALICE = { username: "alice", password: Secret.of("Alice-Password-1") };
const BOB = { username: "bob", password: Secret.of("Bob-Password-1") };

let server: Server;
let context: APIRequestContext;
let anonymous: HttpClient;
let manager: TokenManager;
let issued = 0;
let expiresIn = 1_800;
let planned: Planned[] = [];
let revokeStatus = 200;
let received: Received[] = [];
const rejectedTokens = new Set<string>();

test.beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context = await request.newContext();
  anonymous = new HttpClient(context, `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

test.afterAll(async () => {
  await context.dispose();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  manager = new TokenManager(new TokenClient(anonymous));
  expiresIn = 1_800;
  planned = [];
  revokeStatus = 200;
  received = [];
  rejectedTokens.clear();
});

test.describe("TokenManager.token", () => {
  test("signs in once and reuses the token while it is valid", async () => {
    const first = await manager.token(ALICE);
    const second = await manager.token(ALICE);

    expect(second).toBe(first);
    expect(grants()).toEqual(["password"]);
  });

  test("shares one sign-in among concurrent calls for the same user", async () => {
    const tokens = await Promise.all([manager.token(ALICE), manager.token(ALICE), manager.token(ALICE)]);

    expect(new Set(tokens).size).toBe(1);
    expect(grants()).toEqual(["password"]);
  });

  test("signs in each user separately", async () => {
    const [alice, bob] = await Promise.all([manager.token(ALICE), manager.token(BOB)]);

    expect(alice.accessToken.equals(bob.accessToken)).toBe(false);
    expect(grants()).toEqual(["password", "password"]);
  });

  test("keeps a separate token for the same user in each store", async () => {
    const inStoreA = { ...ALICE, storeId: "store-a" };
    const inStoreB = { ...ALICE, storeId: "store-b" };

    await manager.token(inStoreA);
    await manager.token(inStoreB);
    await manager.token(inStoreA);
    await manager.token(inStoreB);

    expect(received.map((item) => item.form["storeId"])).toEqual(["store-a", "store-b"]);
  });

  test("signs in again when the password changes", async () => {
    await manager.token(ALICE);
    await manager.token({ ...ALICE, password: Secret.of("Alice-Password-2") });

    expect(received.map((item) => item.form["password"])).toEqual(["Alice-Password-1", "Alice-Password-2"]);
  });

  test("renews a token that expires within a minute with its refresh token", async () => {
    expiresIn = 30;
    const stale = await manager.token(ALICE);
    expiresIn = 1_800;

    const renewed = await manager.token(ALICE);

    expect(renewed.accessToken.equals(stale.accessToken)).toBe(false);
    expect(grants()).toEqual(["password", "refresh_token"]);
    expect(received[1]?.form["refresh_token"]).toBe(stale.refreshToken?.reveal());
  });

  test("signs in again when the platform rejects the refresh token", async () => {
    expiresIn = 30;
    await manager.token(ALICE);
    expiresIn = 1_800;
    planned = [{ status: 400, body: { error: "invalid_grant" } }];

    await manager.token(ALICE);

    expect(grants()).toEqual(["password", "refresh_token", "password"]);
  });

  test("signs in again when the token has no refresh token", async () => {
    planned = [{ status: 200, body: tokenBody("No-Refresh-Token-1", 30, false) }];
    await manager.token(ALICE);

    await manager.token(ALICE);

    expect(grants()).toEqual(["password", "password"]);
  });

  test("throws when the refresh fails with another status, and does not cache the failure", async () => {
    expiresIn = 30;
    await manager.token(ALICE);
    expiresIn = 1_800;
    planned = [{ status: 500, body: "" }];

    await expect(manager.token(ALICE)).rejects.toThrow(expect.objectContaining({ status: 500 }));
    await manager.token(ALICE);

    expect(grants()).toEqual(["password", "refresh_token", "password"]);
  });

  test("does not cache a failed sign-in", async () => {
    planned = [{ status: 400, body: { error: "invalid_grant" } }];

    await expect(manager.token(ALICE)).rejects.toThrow(expect.objectContaining({ status: 400 }));
    await manager.token(ALICE);

    expect(grants()).toEqual(["password", "password"]);
  });
});

test.describe("TokenManager.signIn", () => {
  test("throws before returning when the sign-in fails", async () => {
    planned = [{ status: 400, body: { error: "invalid_grant" } }];

    await expect(manager.signIn(anonymous, ALICE)).rejects.toThrow(expect.objectContaining({ status: 400 }));
  });

  test("returns a client that sends the user's token", async () => {
    const client = await manager.signIn(anonymous, ALICE);
    const token = await manager.token(ALICE);

    expect((await client.get("/protected")).status).toBe(200);
    expect(received.at(-1)?.authorization).toBe(`Bearer ${token.accessToken.reveal()}`);
  });

  test("forgets a token that the platform rejects with a 401 status and resends with a new one", async () => {
    const client = await manager.signIn(anonymous, ALICE);
    const rejected = await manager.token(ALICE);
    rejectedTokens.add(rejected.accessToken.reveal());

    const response = await client.get("/protected");

    const renewed = await manager.token(ALICE);
    expect(response.status).toBe(200);
    expect(renewed.accessToken.equals(rejected.accessToken)).toBe(false);
    expect(grants()).toEqual(["password", "password"]);
    expect(received.at(-1)?.authorization).toBe(`Bearer ${renewed.accessToken.reveal()}`);
  });

  test("signs in only once when concurrent requests receive a 401 status", async () => {
    const client = await manager.signIn(anonymous, ALICE);
    rejectedTokens.add((await manager.token(ALICE)).accessToken.reveal());

    const responses = await Promise.all([client.get("/protected"), client.get("/protected"), client.get("/protected")]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(grants()).toEqual(["password", "password"]);
  });
});

test.describe("TokenManager.signOut", () => {
  test("revokes the token and forgets it", async () => {
    const token = await manager.token(ALICE);

    await manager.signOut(ALICE);
    await manager.token(ALICE);

    expect(received.map((item) => item.path)).toEqual(["/connect/token", "/revoke/token", "/connect/token"]);
    expect(received[1]?.authorization).toBe(`Bearer ${token.accessToken.reveal()}`);
  });

  test("does nothing for a user who is not signed in", async () => {
    await manager.signOut(ALICE);

    expect(received).toEqual([]);
  });

  test("does not revoke an expired token", async () => {
    expiresIn = 1;
    await manager.token(ALICE);
    await sleep(1_100);

    await manager.signOut(ALICE);

    expect(received.map((item) => item.path)).toEqual(["/connect/token"]);
  });

  test("keeps the token of the same user in another store", async () => {
    await manager.token({ ...ALICE, storeId: "store-a" });
    await manager.token({ ...ALICE, storeId: "store-b" });

    await manager.signOut({ ...ALICE, storeId: "store-a" });
    await manager.token({ ...ALICE, storeId: "store-b" });

    expect(grants()).toEqual(["password", "password"]);
  });

  test("forgets the token even when the revocation fails", async () => {
    await manager.token(ALICE);
    revokeStatus = 500;

    await expect(manager.signOut(ALICE)).rejects.toThrow(expect.objectContaining({ status: 500 }));
    revokeStatus = 200;
    await manager.token(ALICE);

    expect(grants()).toEqual(["password", "password"]);
  });
});

test.describe("TokenManager.signOutAll", () => {
  test("revokes every token", async () => {
    await Promise.all([manager.token(ALICE), manager.token(BOB)]);

    await manager.signOutAll();

    expect(received.filter((item) => item.path === "/revoke/token")).toHaveLength(2);
  });

  test("signs out every user before it throws the first error", async () => {
    await Promise.all([manager.token(ALICE), manager.token(BOB)]);
    revokeStatus = 500;

    await expect(manager.signOutAll()).rejects.toThrow(expect.objectContaining({ status: 500 }));
    revokeStatus = 200;
    await Promise.all([manager.token(ALICE), manager.token(BOB)]);

    expect(received.filter((item) => item.path === "/revoke/token")).toHaveLength(2);
    expect(grants()).toEqual(["password", "password", "password", "password"]);
  });
});

function grants(): (string | undefined)[] {
  return received.filter((item) => item.path === "/connect/token").map((item) => item.form["grant_type"]);
}

function tokenBody(accessToken: string, expiresInSeconds: number, withRefreshToken: boolean): Record<string, unknown> {
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresInSeconds,
    ...(withRefreshToken ? { refresh_token: `Refresh-For-${accessToken}` } : {}),
  };
}

function handle(incoming: IncomingMessage, outgoing: ServerResponse): void {
  const chunks: Buffer[] = [];
  incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
  incoming.on("end", () => {
    const item: Received = {
      path: incoming.url ?? "",
      form: Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString())),
      authorization: incoming.headers.authorization,
    };
    received.push(item);
    const { status, body } = respond(item);
    outgoing
      .writeHead(status, { "content-type": "application/json" })
      .end(typeof body === "string" ? body : JSON.stringify(body));
  });
}

function respond(item: Received): Planned {
  if (item.path === "/connect/token") {
    issued++;
    return planned.shift() ?? { status: 200, body: tokenBody(`Manager-Token-${issued}`, expiresIn, true) };
  }
  if (item.path === "/revoke/token") {
    return { status: revokeStatus, body: "" };
  }
  const accessToken = item.authorization?.replace(/^Bearer /, "") ?? "";
  const valid = accessToken.startsWith("Manager-Token-") && !rejectedTokens.has(accessToken);
  return { status: valid ? 200 : 401, body: "" };
}
