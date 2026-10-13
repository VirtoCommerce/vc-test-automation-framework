import * as allure from "allure-js-commons";

import { newApiKey } from "@dataset/builders/security";
import { expect, test } from "@fixtures";

const PROTECTED_SETTING = "VirtoCommerce.Search.IndexingJobs.Enable";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Security / API Keys");
});

test.describe("API keys (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("give a user an API key", async ({ api, arrange }) => {
    await allure.story("Create");
    await allure.description("A key given to a user is the user's only key, and it is active.");
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());

    await test.step("act: give the user an API key", () =>
      api.rest.users.apiKeys.create({
        userId: user.id,
        userName: user.userName,
        apiKey: newApiKey().reveal(),
        isActive: true,
      }));
    arrange.security.deleteApiKeysLater(user);

    await test.step("assert: the user has exactly one key, active", async () => {
      expect(await api.rest.users.apiKeys.list(user.id)).toEqual([
        expect.objectContaining({ userId: user.id, isActive: true }),
      ]);
    });
  });

  test("delete an API key", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A deleted key no longer belongs to the user.");
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const { key } = await test.step("arrange: the user's API key", () => arrange.security.apiKey(user));

    await test.step("act: delete the key", () => api.rest.users.apiKeys.delete([key.id]));

    await test.step("assert: the user has no keys", async () => {
      expect(await api.rest.users.apiKeys.list(user.id)).toEqual([]);
    });
  });

  test("reject a deactivated API key", async ({ api, arrange }) => {
    await allure.story("Authentication");
    await allure.description(
      "An active key authenticates its user (who may not read the setting: 403); a deactivated key does not (401).",
    );
    const { user } = await test.step("arrange: a user without roles", () => arrange.security.platformUser());
    const { key, value } = await test.step("arrange: the user's API key", () => arrange.security.apiKey(user));
    const keyHolder = api.anonymous().withHeaders({ api_key: value.reveal() });
    await test.step("assert: the active key authenticates the user", async () => {
      await expect(keyHolder.rest.settings.get(PROTECTED_SETTING)).rejects.toBeHttpError(403);
    });

    await test.step("act: deactivate the key", () => api.rest.users.apiKeys.update({ ...key, isActive: false }));

    await test.step("assert: the deactivated key does not authenticate", async () => {
      await expect(keyHolder.rest.settings.get(PROTECTED_SETTING)).rejects.toBeHttpError(401);
    });
  });
});
