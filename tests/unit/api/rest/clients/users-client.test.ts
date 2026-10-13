import type { Server } from "node:http";
import type { APIRequestContext } from "@playwright/test";

import { createServer } from "node:http";

import { expect, test } from "@playwright/test";

import { HttpClient } from "@api/http/http-client";
import { HttpError } from "@api/http/http-error";
import { UsersClient } from "@api/rest/clients/users-client";
import { MASK, Secret } from "@core/secret";

const RESET_TOKEN = "users-client-reset-token-1";

interface Received {
  readonly path: string;
  readonly body: unknown;
}

let server: Server;
let context: APIRequestContext;
let received: Received[] = [];

test.beforeAll(async ({ playwright }) => {
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      const path = request.url ?? "";
      received.push({ path, body: body === "" ? undefined : JSON.parse(body) });
      if (path.includes("/failing-")) {
        response.writeHead(500, { "Content-Type": "application/json" }).end(body);
      } else if (path.endsWith("/generatePasswordResetToken")) {
        response.writeHead(200, { "Content-Type": "text/plain" }).end(RESET_TOKEN);
      } else {
        response.writeHead(200, { "Content-Type": "application/json" }).end('{"succeeded":true}');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the stub server has no port");
  }
  context = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${address.port}` });
});

test.afterAll(async () => {
  await context.dispose();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test.beforeEach(() => {
  received = [];
});

function users(): UsersClient {
  return new UsersClient(new HttpClient(context));
}

test.describe("UsersClient passwords", () => {
  test("changePassword sends both passwords revealed", async () => {
    await users().changePassword("jane", new Secret("users-old-pass-1"), new Secret("users-new-pass-1"));

    expect(received).toEqual([
      {
        path: "/api/platform/security/users/jane/changepassword",
        body: { oldPassword: "users-old-pass-1", newPassword: "users-new-pass-1" },
      },
    ]);
  });

  test("resetPassword sends the new password revealed", async () => {
    await users().resetPassword("jane", new Secret("users-reset-pass-1"));

    expect(received).toEqual([
      {
        path: "/api/platform/security/users/jane/resetpassword",
        body: { newPassword: "users-reset-pass-1", forcePasswordChangeOnNextSignIn: false },
      },
    ]);
  });

  test("generatePasswordResetToken returns the token as a Secret, masked from then on", async () => {
    const token = await users().generatePasswordResetToken("user-jane");

    expect(token).toBeInstanceOf(Secret);
    expect(token.reveal()).toBe(RESET_TOKEN);
    expect(Secret.mask(`token=${RESET_TOKEN}`)).toBe(`token=${MASK}`);
  });

  test("confirmPasswordReset sends the token and the new password revealed", async () => {
    await users().confirmPasswordReset("user-jane", new Secret("users-token-1"), new Secret("users-confirm-pass-1"));

    expect(received).toEqual([
      {
        path: "/api/platform/security/users/user-jane/resetpasswordconfirm",
        body: { token: "users-token-1", newPassword: "users-confirm-pass-1" },
      },
    ]);
  });

  test("validatePassword sends the password revealed as a JSON string", async () => {
    await users().validatePassword(new Secret("users-validate-pass-1"));

    expect(received).toEqual([{ path: "/api/platform/security/validatepassword", body: "users-validate-pass-1" }]);
  });

  test("masks the new password when a failure echoes the request", async () => {
    const failure = users().resetPassword("failing-jane", new Secret("users-echoed-pass-1"));

    await expect(failure).rejects.toThrow(HttpError);
    await expect(failure).rejects.toThrow(`"newPassword":"${MASK}"`);
    await expect(failure).rejects.not.toThrow("users-echoed-pass-1");
  });
});
