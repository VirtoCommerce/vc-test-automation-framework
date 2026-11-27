import type { APIRequestContext } from "@playwright/test";
import type { BrowserSession, Credentials, SignInContext } from "@/auth";

import { expect, request, test } from "@playwright/test";

import { BrowserSessions } from "@/auth";
import { Secret } from "@/core";

type SignIn = { readonly origin: string; readonly username: string; readonly storeId: string | undefined };

const FRONTEND = "https://frontend.example.com";
const OTHER_FRONTEND = "https://other.example.com";
const ALICE: Credentials = { username: "alice@example.com", password: Secret.of("Alice-Password-1"), storeId: "a" };
const BOB: Credentials = { username: "bob@example.com", password: Secret.of("Bob-Password-1"), storeId: "a" };
const HOUR_MS = 3_600_000;

let contexts: APIRequestContext[] = [];
let signIns: SignIn[] = [];
let signOuts: string[] = [];
let lifetimeMs: number | undefined;
let failSignIn = false;
let failSignOut = false;
let sessions: BrowserSessions;

test.beforeEach(() => {
  contexts = [];
  signIns = [];
  signOuts = [];
  lifetimeMs = HOUR_MS;
  failSignIn = false;
  failSignOut = false;
  sessions = new BrowserSessions({ newContext, strategy });
});

test.afterEach(async () => {
  failSignOut = false;
  await sessions.dispose();
});

test.describe("BrowserSessions.signedIn", () => {
  test("returns the strategy's state, signed in on the origin of the URL", async () => {
    const state = await sessions.signedIn(`${FRONTEND}/en-us/catalog`, ALICE);

    expect(state.origins).toEqual([
      { origin: FRONTEND, localStorage: [{ name: "session", value: "alice@example.com-1" }] },
    ]);
    expect(signIns).toEqual([{ origin: FRONTEND, username: ALICE.username, storeId: "a" }]);
  });

  test("shares one sign-in among concurrent calls and reuses it", async () => {
    const [first, second] = await Promise.all([sessions.signedIn(FRONTEND, ALICE), sessions.signedIn(FRONTEND, ALICE)]);
    const third = await sessions.signedIn(FRONTEND, ALICE);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(signIns).toHaveLength(1);
  });

  test("keeps one session for each user, store and origin, each with its own request context", async () => {
    await sessions.signedIn(FRONTEND, ALICE);
    await sessions.signedIn(FRONTEND, BOB);
    await sessions.signedIn(FRONTEND, { ...ALICE, storeId: "b" });
    await sessions.signedIn(OTHER_FRONTEND, ALICE);

    expect(signIns).toHaveLength(4);
    expect(contexts).toHaveLength(4);
  });

  test("signs in again when the password differs, and disposes of the old session without signing it out", async () => {
    await sessions.signedIn(FRONTEND, ALICE);

    await sessions.signedIn(FRONTEND, { ...ALICE, password: Secret.of("Alice-Password-2") });

    expect(signIns).toHaveLength(2);
    expect(signOuts).toEqual([]);
    await expectDisposed(0);
  });

  test("signs in again when the session expires within a minute, without signing the old one out", async () => {
    lifetimeMs = 30_000;
    await sessions.signedIn(FRONTEND, ALICE);

    const state = await sessions.signedIn(FRONTEND, ALICE);

    expect(state.origins[0]?.localStorage[0]?.value).toBe("alice@example.com-2");
    expect(signOuts).toEqual([]);
    await expectDisposed(0);
  });

  test("keeps a session without an expiry until it is signed out", async () => {
    lifetimeMs = undefined;
    await sessions.signedIn(FRONTEND, ALICE);

    await sessions.signedIn(FRONTEND, ALICE);

    expect(signIns).toHaveLength(1);
  });

  test("does not keep a failed sign-in and disposes of its request context", async () => {
    failSignIn = true;
    await expect(sessions.signedIn(FRONTEND, ALICE)).rejects.toThrow("refused alice@example.com");
    failSignIn = false;

    await expect(sessions.signedIn(FRONTEND, ALICE)).resolves.toBeDefined();
    expect(signIns).toHaveLength(2);
    await expectDisposed(0);
  });
});

test.describe("BrowserSessions.signOut", () => {
  test("ends the user's sessions on every origin and keeps the other users", async () => {
    await sessions.signedIn(FRONTEND, ALICE);
    await sessions.signedIn(OTHER_FRONTEND, ALICE);
    await sessions.signedIn(FRONTEND, BOB);

    await sessions.signOut(ALICE);
    await sessions.signedIn(FRONTEND, ALICE);
    await sessions.signedIn(FRONTEND, BOB);

    expect(signOuts).toEqual(["alice@example.com-1", "alice@example.com-2"]);
    expect(signIns).toHaveLength(4);
    await expectDisposed(0, 1);
  });

  test("keeps the sessions of the same user in another store", async () => {
    await sessions.signedIn(FRONTEND, ALICE);
    await sessions.signedIn(FRONTEND, { ...ALICE, storeId: "b" });

    await sessions.signOut(ALICE);

    expect(signOuts).toEqual(["alice@example.com-1"]);
  });
});

test.describe("BrowserSessions.dispose", () => {
  test("ends every session and disposes of the request contexts", async () => {
    await sessions.signedIn(FRONTEND, ALICE);
    await sessions.signedIn(OTHER_FRONTEND, BOB);

    await sessions.dispose();

    expect(signOuts.toSorted()).toEqual(["alice@example.com-1", "bob@example.com-2"]);
    await expectDisposed(0, 1);
  });

  test("does not sign out a session past its expiry, but disposes of its request context", async () => {
    lifetimeMs = -1_000;
    await sessions.signedIn(FRONTEND, ALICE);

    await sessions.dispose();

    expect(signOuts).toEqual([]);
    await expectDisposed(0);
  });

  test("closes every session before it throws the first sign-out failure", async () => {
    await sessions.signedIn(FRONTEND, ALICE);
    await sessions.signedIn(FRONTEND, BOB);
    failSignOut = true;

    await expect(sessions.dispose()).rejects.toThrow("sign-out failed");
    await expectDisposed(0, 1);
  });
});

async function strategy({ origin }: SignInContext, { username, storeId }: Credentials): Promise<BrowserSession> {
  signIns.push({ origin, username, storeId });
  if (failSignIn) {
    throw new Error(`refused ${username}`);
  }
  const value = `${username}-${signIns.length}`;
  return {
    state: { cookies: [], origins: [{ origin, localStorage: [{ name: "session", value }] }] },
    expiresAt: lifetimeMs === undefined ? undefined : Date.now() + lifetimeMs,
    signOut: async () => {
      if (failSignOut) {
        throw new Error("sign-out failed");
      }
      signOuts.push(value);
    },
  };
}

async function newContext(): Promise<APIRequestContext> {
  const context = await request.newContext();
  contexts.push(context);
  return context;
}

async function expectDisposed(...indexes: number[]): Promise<void> {
  for (const index of indexes) {
    const context = contexts[index];
    expect(context, `request context ${index}`).toBeDefined();
    await expect(context?.storageState() ?? Promise.resolve()).rejects.toThrow();
  }
}
