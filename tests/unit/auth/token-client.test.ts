import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { APIRequestContext } from "@playwright/test";
import type { AuthToken } from "@/auth";

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

import { expect, request, test } from "@playwright/test";

import { authHeader, TokenClient } from "@/auth";
import { MASKED, Secret } from "@/core";
import { HttpClient } from "@/http";

type Received = {
  readonly path: string;
  readonly form: Readonly<Record<string, string>>;
  readonly authorization: string | undefined;
};

type Planned = { readonly status: number; readonly body: unknown; readonly delayMs?: number };

const TOKEN_BODY = {
  access_token: "Access-Token-1",
  token_type: "Bearer",
  expires_in: 1_800,
  refresh_token: "Refresh-Token-1",
};

const ADMIN = { username: "admin", password: Secret.of("Admin-Password-1") };

let server: Server;
let context: APIRequestContext;
let client: TokenClient;
let received: Received[] = [];
let planned: Planned[] = [];
let inFlight = 0;
let maxInFlight = 0;

test.beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context = await request.newContext();
  client = new TokenClient(new HttpClient(context, `http://127.0.0.1:${(server.address() as AddressInfo).port}`));
});

test.afterAll(async () => {
  await context.dispose();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  received = [];
  planned = [];
  maxInFlight = 0;
});

test.describe("TokenClient.signIn", () => {
  test("sends a password grant and returns the token", async () => {
    const before = Date.now();

    const token = await client.signIn(ADMIN);

    expect(received).toEqual([
      {
        path: "/connect/token",
        form: { grant_type: "password", username: "admin", password: "Admin-Password-1", scope: "offline_access" },
        authorization: undefined,
      },
    ]);
    expect(token.accessToken).toBeInstanceOf(Secret);
    expect(token.accessToken.reveal()).toBe("Access-Token-1");
    expect(token.refreshToken?.reveal()).toBe("Refresh-Token-1");
    expect(token.tokenType).toBe("Bearer");
    expect(token.expiresAt).toBeGreaterThanOrEqual(before + 1_800_000);
    expect(token.expiresAt).toBeLessThanOrEqual(Date.now() + 1_800_000);
  });

  test("sends the store when the credentials have one", async () => {
    await client.signIn({ ...ADMIN, storeId: "store-1" });

    expect(received[0]?.form["storeId"]).toBe("store-1");
  });

  test("returns no refresh token when the platform issues none", async () => {
    planned = [{ status: 200, body: { ...TOKEN_BODY, refresh_token: undefined } }];

    expect((await client.signIn(ADMIN)).refreshToken).toBeUndefined();
  });

  test("throws without retrying when the sign-in is rejected", async () => {
    planned = [{ status: 400, body: { error: "invalid_grant" } }];

    await expect(client.signIn(ADMIN)).rejects.toThrow(expect.objectContaining({ status: 400 }));
    expect(received).toHaveLength(1);
  });

  test("throws when the response is not a token", async () => {
    planned = [{ status: 200, body: { token_type: "Bearer" } }];

    await expect(client.signIn(ADMIN)).rejects.toThrow("unexpected response body");
  });

  test("signs in the same user one at a time", async () => {
    const user = { ...ADMIN, username: randomUUID() };
    planned = [
      { status: 200, body: TOKEN_BODY, delayMs: 200 },
      { status: 200, body: TOKEN_BODY, delayMs: 200 },
    ];

    await Promise.all([client.signIn(user), client.signIn(user)]);

    expect(received).toHaveLength(2);
    expect(maxInFlight).toBe(1);
  });

  test("signs in different users at the same time", async () => {
    planned = [
      { status: 200, body: TOKEN_BODY, delayMs: 200 },
      { status: 200, body: TOKEN_BODY, delayMs: 200 },
    ];

    await Promise.all([
      client.signIn({ ...ADMIN, username: randomUUID() }),
      client.signIn({ ...ADMIN, username: randomUUID() }),
    ]);

    expect(maxInFlight).toBe(2);
  });

  test("lets the next sign-in of the user through after a failed one", async () => {
    const user = { ...ADMIN, username: randomUUID() };
    planned = [{ status: 500, body: "" }];

    await expect(client.signIn(user)).rejects.toThrow(expect.objectContaining({ status: 500 }));

    expect((await client.signIn(user)).accessToken.reveal()).toBe("Access-Token-1");
  });

  test("throws without retrying for a 500 status", async () => {
    planned = [{ status: 500, body: "" }];

    await expect(client.signIn(ADMIN)).rejects.toThrow(expect.objectContaining({ status: 500 }));
    expect(received).toHaveLength(1);
  });
});

test.describe("TokenClient.requestPasswordGrant", () => {
  test("returns the response without retrying", async () => {
    planned = [{ status: 500, body: "" }];

    expect((await client.requestPasswordGrant(ADMIN)).status).toBe(500);
    expect(received).toHaveLength(1);
  });

  test("adds extra fields, which replace standard fields of the same name", async () => {
    await client.requestPasswordGrant(ADMIN, { organization_id: "org-1", scope: "openid" });

    expect(received[0]?.form).toMatchObject({ organization_id: "org-1", scope: "openid", username: "admin" });
  });
});

test.describe("TokenClient.refresh", () => {
  test("sends a refresh grant and returns the new token", async () => {
    planned = [{ status: 200, body: { ...TOKEN_BODY, access_token: "Access-Token-2" } }];

    const token = await client.refresh(Secret.of("Refresh-Token-2"));

    expect(received[0]?.form).toEqual({ grant_type: "refresh_token", refresh_token: "Refresh-Token-2" });
    expect(token?.accessToken.reveal()).toBe("Access-Token-2");
  });

  test("returns undefined when the refresh token is rejected with a 400 status", async () => {
    planned = [{ status: 400, body: { error: "invalid_grant" } }];

    expect(await client.refresh(Secret.of("Refresh-Token-3"))).toBeUndefined();
  });

  test("throws without retrying for a 500 status", async () => {
    planned = [{ status: 500, body: "" }];

    await expect(client.refresh(Secret.of("Refresh-Token-4"))).rejects.toThrow(
      expect.objectContaining({ status: 500 }),
    );
    expect(received).toHaveLength(1);
  });
});

test.describe("TokenClient.revoke", () => {
  test("sends the access token in the Authorization header", async () => {
    await client.revoke(token("Revoked-Token-1"));

    expect(received).toEqual([{ path: "/revoke/token", form: {}, authorization: "Bearer Revoked-Token-1" }]);
  });

  test("throws when the platform does not confirm the revocation", async () => {
    planned = [{ status: 401, body: "" }];

    await expect(client.revoke(token("Revoked-Token-2"))).rejects.toThrow(expect.objectContaining({ status: 401 }));
  });
});

test.describe("authHeader", () => {
  test("returns the header value as a Secret", () => {
    const value = authHeader(token("Header-Token-1"))["authorization"];

    expect(value).toBeInstanceOf(Secret);
    expect(String(value)).toBe(MASKED);
    expect((value as Secret).reveal()).toBe("Bearer Header-Token-1");
  });
});

function token(accessToken: string): AuthToken {
  return { accessToken: Secret.of(accessToken), tokenType: "Bearer", expiresAt: 0, refreshToken: undefined };
}

function handle(incoming: IncomingMessage, outgoing: ServerResponse): void {
  const chunks: Buffer[] = [];
  incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
  inFlight += 1;
  maxInFlight = Math.max(maxInFlight, inFlight);
  incoming.on("end", () => {
    received.push({
      path: incoming.url ?? "",
      form: Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString())),
      authorization: incoming.headers.authorization,
    });
    const { status, body, delayMs = 0 } = planned.shift() ?? { status: 200, body: TOKEN_BODY };
    setTimeout(() => {
      inFlight -= 1;
      outgoing
        .writeHead(status, { "content-type": "application/json" })
        .end(typeof body === "string" ? body : JSON.stringify(body));
    }, delayMs);
  });
}
