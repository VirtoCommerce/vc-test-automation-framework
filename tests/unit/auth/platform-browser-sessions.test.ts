import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { APIRequestContext } from "@playwright/test";

import { createServer } from "node:http";

import { expect, request, test } from "@playwright/test";

import { PlatformBrowserSessions } from "@/auth";
import { Secret } from "@/core";

type Received = { readonly path: string; readonly body: Readonly<Record<string, unknown>> };

const ADMIN = { username: "admin", password: Secret.of("Admin-Password-1") };
const MANAGER = { username: "manager", password: Secret.of("Manager-Password-1") };

let server: Server;
let platformUrl: string;
let sessions: PlatformBrowserSessions;
let contexts: APIRequestContext[] = [];
let received: Received[] = [];
let signInResult: Record<string, unknown> | undefined;
let signIns = 0;

test.beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  platformUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  contexts = [];
  received = [];
  signInResult = undefined;
  signIns = 0;
  sessions = new PlatformBrowserSessions({ platformBaseUrl: platformUrl, newContext });
});

test.describe("PlatformBrowserSessions.signedIn", () => {
  test("signs in with the user's password and returns the sign-in cookie", async () => {
    const state = await sessions.signedIn(ADMIN);

    expect(received).toEqual([
      { path: "/api/platform/security/login", body: { userName: "admin", password: "Admin-Password-1" } },
    ]);
    expect(state.cookies).toEqual([
      expect.objectContaining({ name: ".AspNetCore.Identity.Application", value: "admin-session-1" }),
    ]);
  });

  test("disposes of the request context after the sign-in", async () => {
    await sessions.signedIn(ADMIN);

    expect(contexts).toHaveLength(1);
    for (const context of contexts) {
      await expect(context.get(platformUrl)).rejects.toThrow();
    }
  });

  test("reuses the state of a user and shares one sign-in among concurrent calls", async () => {
    const [first, second] = await Promise.all([sessions.signedIn(ADMIN), sessions.signedIn(ADMIN)]);
    const third = await sessions.signedIn(ADMIN);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(signIns).toBe(1);
  });

  test("signs each user in separately", async () => {
    await Promise.all([sessions.signedIn(ADMIN), sessions.signedIn(MANAGER)]);

    expect(signIns).toBe(2);
  });

  test("signs in again when the password of a user differs", async () => {
    await sessions.signedIn(ADMIN);
    await sessions.signedIn({ ...ADMIN, password: Secret.of("Admin-Password-2") });

    expect(signIns).toBe(2);
  });

  for (const [result, reason] of [
    [{ succeeded: false, isLockedOut: true }, "the user is locked out"],
    [{ succeeded: false, isNotAllowed: true }, "the user is not allowed to sign in"],
    [{ succeeded: false, requiresTwoFactor: true }, "the user needs two-factor authentication"],
    [{ succeeded: false }, "the user name or password is wrong"],
  ] as const) {
    test(`fails with the reason when ${reason}`, async () => {
      signInResult = result;

      await expect(sessions.signedIn(ADMIN)).rejects.toThrow(`Signing in to the platform as admin failed: ${reason}`);
    });
  }

  test("does not keep a failed sign-in", async () => {
    signInResult = { succeeded: false };
    await expect(sessions.signedIn(ADMIN)).rejects.toThrow();
    signInResult = undefined;

    await expect(sessions.signedIn(ADMIN)).resolves.toBeDefined();
    expect(signIns).toBe(2);
  });
});

test.describe("PlatformBrowserSessions.forget", () => {
  test("makes the next call for the user sign in again, and keeps other users", async () => {
    await sessions.signedIn(ADMIN);
    await sessions.signedIn(MANAGER);

    sessions.forget(ADMIN);
    await sessions.signedIn(ADMIN);
    await sessions.signedIn(MANAGER);

    expect(signIns).toBe(3);
  });
});

async function newContext(): Promise<APIRequestContext> {
  const context = await request.newContext();
  contexts.push(context);
  return context;
}

function handle(incoming: IncomingMessage, outgoing: ServerResponse): void {
  const chunks: Buffer[] = [];
  incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
  incoming.on("end", () => {
    const text = Buffer.concat(chunks).toString();
    const item: Received = { path: incoming.url ?? "", body: text === "" ? {} : JSON.parse(text) };
    received.push(item);
    if (item.path !== "/api/platform/security/login") {
      outgoing.writeHead(404).end();
      return;
    }
    signIns += 1;
    const result = signInResult ?? { succeeded: true };
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (result["succeeded"] === true) {
      headers["set-cookie"] = `.AspNetCore.Identity.Application=${item.body["userName"]}-session-${signIns}; Path=/`;
    }
    outgoing.writeHead(200, headers).end(JSON.stringify(result));
  });
}
