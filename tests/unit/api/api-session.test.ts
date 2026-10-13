import type { APIRequestContext } from "@playwright/test";
import type { ApiConnection, UserResolver } from "@api/api-session";
import type { GraphqlDocument } from "@api/graphql/graphql-client";
import type { AuthStub } from "./auth/auth-stub";

import { expect, test } from "@playwright/test";

import { ApiSession } from "@api/api-session";
import { TokenClient } from "@api/auth/token-client";
import { TokenManager } from "@api/auth/token-manager";
import { HttpClient } from "@api/http/http-client";
import { RestApi } from "@api/rest/rest-api";
import { Secret } from "@core/secret";

import { startAuthStub } from "./auth/auth-stub";

const ECHO = { toString: () => "query Echo { authorization }" } as GraphqlDocument<
  { authorization: string | null },
  Record<string, never>
>;

const KNOWN_PASSWORD = new Secret("api-session-password-1");

function resolve(userName: string): { readonly username: string; readonly password: Secret } {
  if (!userName.startsWith("known-")) {
    throw new Error(`No user "${userName}"`);
  }
  return { username: userName, password: KNOWN_PASSWORD };
}

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

const STORE = { storeId: "store-acme", cultureName: "en-US", currencyCode: "USD" } as const;

function connection(): ApiConnection {
  return { context, tokens: new TokenManager(new TokenClient(new HttpClient(context), STORE.storeId)), store: STORE };
}

function known(name: string): string {
  return `known-${name}-${test.info().testId}`;
}

async function authorizationOf(session: ApiSession): Promise<string | null> {
  return (await session.graphql.execute(ECHO)).authorization;
}

test.describe("ApiSession", () => {
  test("is anonymous without a user", async () => {
    const session = await ApiSession.open(connection(), resolve, undefined);

    expect(session.credentials).toBeUndefined();
    expect(session.rest).toBeInstanceOf(RestApi);
    expect(await authorizationOf(session)).toBeNull();
  });

  test("signs a user known by name in with the resolver's credentials", async () => {
    const userName = known("admin");

    const session = await ApiSession.open(connection(), resolve, userName);

    expect(session.credentials?.username).toBe(userName);
    expect(stub.lastForm()).toMatchObject({ username: userName, password: KNOWN_PASSWORD.reveal() });
    expect(await authorizationOf(session)).toBe(`Bearer 1:${userName}:access`);
  });

  test("signs in with given credentials without asking the resolver", async () => {
    const username = `created-${test.info().testId}`;
    const refuse: UserResolver = () => {
      throw new Error("the resolver must not be asked");
    };

    const session = await ApiSession.open(connection(), refuse, { username, password: new Secret("created-pw-1") });

    expect(await authorizationOf(session)).toBe(`Bearer 1:${username}:access`);
  });

  test("passes on the resolver's error for an unknown user", async () => {
    await expect(ApiSession.open(connection(), resolve, "stranger")).rejects.toThrow('No user "stranger"');
  });

  test.describe("as", () => {
    test("opens another user's session over the same connection", async () => {
      const admin = await ApiSession.open(connection(), resolve, known("admin"));
      const maintainerName = known("maintainer");

      const maintainer = await admin.as(maintainerName);

      expect(maintainer.credentials?.username).toBe(maintainerName);
      expect(await authorizationOf(maintainer)).toMatch(new RegExp(`:${maintainerName}:access$`));
      expect(await authorizationOf(admin)).toMatch(/^Bearer \d+:known-admin-/);
    });

    test("reuses a user's sign-in within the connection", async () => {
      const userName = known("reused");
      const anonymous = await ApiSession.open(connection(), resolve, undefined);

      await anonymous.as(userName);
      await anonymous.as(userName);

      expect(stub.passwordGrants(userName)).toBe(1);
    });
  });

  test.describe("auth", () => {
    test("signs in at the token endpoint on every call, outside the connection's token cache", async () => {
      const username = known("auth");
      const session = await ApiSession.open(connection(), resolve, undefined);

      const tokens = [
        await session.auth.signIn({ username, password: KNOWN_PASSWORD }),
        await session.auth.signIn({ username, password: KNOWN_PASSWORD }),
      ];

      expect(tokens.map(({ accessToken }) => accessToken.reveal())).toEqual([
        `1:${username}:access`,
        `2:${username}:access`,
      ]);
    });
  });

  test.describe("anonymous", () => {
    test("opens an anonymous session next to a signed-in one", async () => {
      const admin = await ApiSession.open(connection(), resolve, known("admin"));

      const visitor = admin.anonymous();

      expect(visitor.credentials).toBeUndefined();
      expect(await authorizationOf(visitor)).toBeNull();
      expect(await authorizationOf(admin)).toMatch(/^Bearer \d+:known-admin-/);
    });
  });

  test.describe("withHeaders", () => {
    test("sends the extra headers with every request of the new session only", async () => {
      const visitor = await ApiSession.open(connection(), resolve, undefined);

      const tokenHolder = visitor.withHeaders({ Authorization: "Bearer issued-elsewhere" });

      expect(await authorizationOf(tokenHolder)).toBe("Bearer issued-elsewhere");
      expect(await authorizationOf(visitor)).toBeNull();
    });

    test("refuses a signed-in session, whose user the headers might contradict", async () => {
      const userName = known("keeper");
      const session = await ApiSession.open(connection(), resolve, userName);

      expect(() => session.withHeaders({ "X-Extra": "1" })).toThrow("withHeaders is for anonymous sessions");
    });

    test("gives an anonymous session without credentials", async () => {
      const visitor = await ApiSession.open(connection(), resolve, undefined);

      expect(visitor.withHeaders({ "X-Extra": "1" }).credentials).toBeUndefined();
    });
  });

  test.describe("storeContext", () => {
    test("gives a signed-in session the store settings and its user's id, asking the platform once", async () => {
      const userName = known("shopper");
      const session = await ApiSession.open(connection(), resolve, userName);

      const contexts = [await session.storeContext(), await session.storeContext()];

      expect(contexts).toEqual([
        { ...STORE, userId: `id-of-${userName}` },
        { ...STORE, userId: `id-of-${userName}` },
      ]);
      expect(stub.getMeCalls(userName)).toBe(1);
    });

    test("does not keep a failed load, so the next call asks the platform again", async () => {
      const userName = known("nomefirst");
      const session = await ApiSession.open(connection(), resolve, userName);

      await expect(session.storeContext()).rejects.toThrow(`did not give the id of "${userName}"`);
      const context = await session.storeContext();

      expect(context).toEqual({ ...STORE, userId: `id-of-${userName}` });
      expect(stub.getMeCalls(userName)).toBe(2);
    });

    test("gives each anonymous session its own random user id, kept for the session", async () => {
      const first = await ApiSession.open(connection(), resolve, undefined);
      const second = await ApiSession.open(connection(), resolve, undefined);

      const [firstContext, firstAgain, secondContext] = [
        await first.storeContext(),
        await first.storeContext(),
        await second.storeContext(),
      ];

      expect(firstContext).toMatchObject({ ...STORE, userId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
      expect(firstAgain.userId).toBe(firstContext.userId);
      expect(secondContext.userId).not.toBe(firstContext.userId);
    });
  });

  test.describe("signOut", () => {
    test("revokes the user's token, so the next session signs in again", async () => {
      const userName = known("leaving");
      const session = await ApiSession.open(connection(), resolve, userName);
      const token = await authorizationOf(session);

      await session.signOut();
      await session.as(userName);

      expect(stub.revokedTokens).toContain(token?.replace(/^Bearer /, ""));
      expect(stub.passwordGrants(userName)).toBe(2);
    });

    test("does nothing for an anonymous session", async () => {
      const session = await ApiSession.open(connection(), resolve, undefined);

      await expect(session.signOut()).resolves.toBeUndefined();
    });
  });
});
