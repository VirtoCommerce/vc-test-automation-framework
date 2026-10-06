import * as allure from "allure-js-commons";

import { UsersClient } from "@api/rest/clients/users-client";
import { arrangeApiKey, arrangeUser } from "@dataset/arrange/security";
import { newApiKey, newUser } from "@dataset/builders/security";
import { asWorkerAdministrator, expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.feature("Platform / API Keys");
});

test.describe("API keys (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  test("create an API key for a user", async ({ httpClient, cleanupStack, env }) => {
    const usersClient = new UsersClient(httpClient);
    const user = await test.step("arrange: user", () => arrangeUser(usersClient, cleanupStack, newUser(env.storeId)));

    const key = await test.step("act: create API key", () =>
      arrangeApiKey(usersClient, cleanupStack, user, newApiKey()));

    await test.step("assert: API key is active and belongs to the user", async () => {
      expect(key).toMatchObject({ userId: user.id, isActive: true });
    });
  });

  test("list the API keys of a user", async ({ httpClient, cleanupStack, env }) => {
    const usersClient = new UsersClient(httpClient);
    const user = await test.step("arrange: user", () => arrangeUser(usersClient, cleanupStack, newUser(env.storeId)));
    const key = await test.step("arrange: API key", () => arrangeApiKey(usersClient, cleanupStack, user, newApiKey()));

    const keys = await test.step("act: list API keys", () => usersClient.listApiKeys(user.id));

    await test.step("assert: the user has only that key", async () => {
      expect(keys.map(({ id }) => id)).toEqual([key.id]);
    });
  });

  test("deactivate an API key", async ({ httpClient, cleanupStack, env }) => {
    const usersClient = new UsersClient(httpClient);
    const user = await test.step("arrange: user", () => arrangeUser(usersClient, cleanupStack, newUser(env.storeId)));
    const key = await test.step("arrange: API key", () => arrangeApiKey(usersClient, cleanupStack, user, newApiKey()));

    await test.step("act: deactivate API key", () => usersClient.updateApiKey({ ...key, isActive: false }));

    await test.step("assert: API key is inactive", async () => {
      expect(await usersClient.listApiKeys(user.id)).toEqual([
        expect.objectContaining({ id: key.id, isActive: false }),
      ]);
    });
  });

  test("delete an API key", async ({ httpClient, cleanupStack, env }) => {
    const usersClient = new UsersClient(httpClient);
    const user = await test.step("arrange: user", () => arrangeUser(usersClient, cleanupStack, newUser(env.storeId)));
    const key = await test.step("arrange: API key", () => arrangeApiKey(usersClient, cleanupStack, user, newApiKey()));

    await test.step("act: delete API key", () => usersClient.deleteApiKeys([key.id]));

    await test.step("assert: user has no API keys", async () => {
      expect(await usersClient.listApiKeys(user.id)).toEqual([]);
    });
  });
});
