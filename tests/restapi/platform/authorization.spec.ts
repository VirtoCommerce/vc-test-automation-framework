import * as allure from "allure-js-commons";

import { authHeader, TokenAuthClient } from "@api/auth/token-auth-client";
import { UsersClient } from "@api/rest/clients/users-client";
import { arrangeUser } from "@dataset/arrange/security";
import { credentialsOf, newPassword, newUser } from "@dataset/builders/security";
import { SEEDED_USERS } from "@dataset/seeded";
import { expect, seededUser, test } from "@fixtures";

const USERNAME = SEEDED_USERS.storeAdministrator;

test.beforeEach(async () => {
  await allure.feature("Platform / Authorization");
});

test.describe("authorization (admin)", () => {
  test.use({ user: seededUser(USERNAME) });

  test("get a token with valid credentials", async ({ httpClient, anonymousHttpClient, cleanupStack, env }) => {
    const usersClient = new UsersClient(httpClient);
    const draft = newUser(env.storeId);
    await test.step("arrange: user", () => arrangeUser(usersClient, cleanupStack, draft));

    const token = await test.step("act: request token", () =>
      new TokenAuthClient(anonymousHttpClient).requestToken(credentialsOf(draft), env.storeId));

    await test.step("assert: the bearer token signs the user in", async () => {
      expect(token.tokenType).toBe("Bearer");
      const currentUser = await new UsersClient(anonymousHttpClient.withHeaders(authHeader(token))).getCurrentUser();
      expect(currentUser.userName).toBe(draft.userName);
    });
  });

  test("reject a token request without a user name", async ({ anonymousHttpClient, env }) => {
    const response = await test.step("act: request token with an empty user name", () =>
      new TokenAuthClient(anonymousHttpClient).postPasswordGrant(
        { username: "", password: newPassword() },
        env.storeId,
      ));

    await test.step("assert: request is rejected with an OAuth error", async () => {
      expect(response.status).toBe(400);
      expect(response.json()).toMatchObject({ error: "invalid_request" });
    });
  });

  test("reject a token request with a wrong password", async ({
    httpClient,
    anonymousHttpClient,
    cleanupStack,
    env,
  }) => {
    const usersClient = new UsersClient(httpClient);
    const draft = newUser(env.storeId);
    await test.step("arrange: user", () => arrangeUser(usersClient, cleanupStack, draft));

    const response = await test.step("act: request token with a wrong password", () =>
      new TokenAuthClient(anonymousHttpClient).postPasswordGrant(
        { username: draft.userName, password: newPassword() },
        env.storeId,
      ));

    await test.step("assert: sign-in fails", async () => {
      expect(response.status).toBe(400);
      expect(response.json()).toMatchObject({ error: "invalid_grant" });
    });
  });

  test("get the current user", async ({ httpClient }) => {
    const usersClient = new UsersClient(httpClient);

    const currentUser = await test.step("act: get current user", () => usersClient.getCurrentUser());

    await test.step("assert: current user is the signed-in administrator", async () => {
      expect(currentUser).toMatchObject({ userName: USERNAME, isAdministrator: true });
    });
  });
});
