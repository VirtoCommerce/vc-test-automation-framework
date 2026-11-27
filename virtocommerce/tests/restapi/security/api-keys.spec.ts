import type { PlatformUser } from "@arrange";
import type { VirtoCommercePlatformCoreSecurityUserApiKey as UserApiKey } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newApiKey } from "@builders/security.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

const API_KEYS_PATH = "/api/platform/security/users/apikeys";
const PROTECTED_SETTING_PATH = "/api/platform/settings/VirtoCommerce.Search.IndexingJobs.Enable";

test.describe("API keys (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("give a user an API key", async ({ api, arrange }) => {
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());

    await test.step("act: give the user an API key", async () =>
      (
        await api.post(API_KEYS_PATH, {
          json: { userId: user.id, userName: user.userName, apiKey: newApiKey().reveal(), isActive: true },
        })
      ).expectOk());
    arrange.security.deleteApiKeysLater(user);

    await test.step("assert: the user has exactly one key, active", async () => {
      expect(await apiKeysOf(api, user)).toEqual([expect.objectContaining({ userId: user.id, isActive: true })]);
    });
  });

  test("delete an API key", async ({ api, arrange }) => {
    const { user } = await test.step("arrange: a user", () => arrange.security.platformUser());
    const { key } = await test.step("arrange: the user's API key", () => arrange.security.apiKey(user));

    await test.step("act: delete the key", async () =>
      (await api.delete(API_KEYS_PATH, { query: { ids: [key.id] } })).expectOk());

    await test.step("assert: the user has no keys", async () => {
      expect(await apiKeysOf(api, user)).toEqual([]);
    });
  });

  test("reject a deactivated API key", async ({ api, http, arrange }) => {
    const { user } = await test.step("arrange: a user without roles", () => arrange.security.platformUser());
    const { key, value } = await test.step("arrange: the user's API key", () => arrange.security.apiKey(user));
    const keyHolder = http.withHeaders({ api_key: value.reveal() });
    await test.step("assert: the active key authenticates the user, who may not read the setting", async () => {
      expect((await keyHolder.get(PROTECTED_SETTING_PATH)).status).toBe(403);
    });

    await test.step("act: deactivate the key", async () =>
      (await api.put(API_KEYS_PATH, { json: { ...key, isActive: false } })).expectOk());

    await test.step("assert: the deactivated key does not authenticate", async () => {
      expect((await keyHolder.get(PROTECTED_SETTING_PATH)).status).toBe(401);
    });
  });
});

async function apiKeysOf(api: HttpClient, user: PlatformUser): Promise<UserApiKey[]> {
  return (await api.get(`/api/platform/security/users/${user.id}/apikeys`)).expectOk().json<UserApiKey[]>();
}
