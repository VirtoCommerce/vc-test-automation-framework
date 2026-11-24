import type { VirtoCommercePlatformCoreChangeLogOperationLog as OperationLog } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { requireFields } from "@support/require-fields.ts";

const CHANGES_PATH = "/api/changes";
const CHANGE_LOG_TIMEOUT_MS = 30_000;
const USER_TYPE = "ApplicationUser";
const ANOTHER_TYPE = "Role";

test.describe("change log (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("get the last modified date", async ({ api }) => {
    const lastModified = await test.step("act: get the last modified date", () => lastModifiedDate(api));

    await test.step("assert: it is a valid date", () => {
      expect(Number.isNaN(Date.parse(lastModified))).toBe(false);
    });
  });

  test("forcing changes moves the last modified date forward", async ({ api }) => {
    const before = await test.step("arrange: the current last modified date", () => lastModifiedDate(api));

    await test.step("act: force changes", async () => (await api.post(`${CHANGES_PATH}/force`)).expectOk());

    await test.step("assert: the last modified date is later", async () => {
      expect(Date.parse(await lastModifiedDate(api))).toBeGreaterThan(Date.parse(before));
    });
  });

  test("search the change log by object id", async ({ api, arrange }) => {
    const { user } = await test.step("arrange: a new user", () => arrange.security.platformUser());

    await test.step("act and assert: searching the user's changes finds exactly its creation", async () => {
      await expect
        .poll(() => changesOf(api, { objectIds: [user.id] }), { timeout: CHANGE_LOG_TIMEOUT_MS })
        .toEqual([expect.objectContaining({ objectType: USER_TYPE, objectId: user.id, operationType: "Added" })]);
    });
  });

  test("filter the change log by object type", async ({ api, arrange }) => {
    const { user } = await test.step("arrange: a new user", () => arrange.security.platformUser());

    await test.step(`act and assert: only searching as ${USER_TYPE} finds the user's changes`, async () => {
      await expect
        .poll(
          async () => ({
            asUser: (await changesOf(api, { objectIds: [user.id], objectType: USER_TYPE })).map(
              ({ objectId }) => objectId,
            ),
            asOther: await changesOf(api, { objectIds: [user.id], objectType: ANOTHER_TYPE }),
          }),
          { timeout: CHANGE_LOG_TIMEOUT_MS },
        )
        .toEqual({ asUser: [user.id], asOther: [] });
    });
  });
});

async function lastModifiedDate(api: HttpClient): Promise<string> {
  const response = await api.get(`${CHANGES_PATH}/lastmodifieddate`);
  return requireFields(response.expectOk().json<{ lastModifiedDate?: string }>(), ["lastModifiedDate"], "Changes")
    .lastModifiedDate;
}

async function changesOf(
  api: HttpClient,
  criteria: { readonly objectIds: readonly string[]; readonly objectType?: string },
): Promise<OperationLog[]> {
  const response = await api.post("/api/platform/changelog/v2/search", { json: criteria });
  return response.expectOk().json<{ results?: OperationLog[] | null }>().results ?? [];
}
