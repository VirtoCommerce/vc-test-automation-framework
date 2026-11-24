import type { VirtoCommerceSearchModuleCoreModelIndexProgressPushNotification as IndexProgress } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { pushNotificationOf } from "@support/push-notifications.ts";
import { requireFields } from "@support/require-fields.ts";
import { DESTRUCTIVE_TAG } from "@virtocommerce/test-automation-framework/core";

const INDEXES_PATH = "/api/search/indexes";
const PRODUCT_DOCUMENT = "Product";
const PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";
const COMPLETED = "Indexation completed successfully";
const CANCELED = "Indexation has been canceled";
const PROCESSING_START_TIMEOUT_MS = 60_000;
const FULL_REBUILD_TIMEOUT_MS = 300_000;

test.describe("search indexes (store administrator, whole index)", { tag: DESTRUCTIVE_TAG }, () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("cancel a running indexation", async ({ api }) => {
    test.setTimeout(FULL_REBUILD_TIMEOUT_MS + 30_000);
    const started = await test.step("arrange: a full product reindex, one document per batch", () =>
      startIndexation(api, { documentType: PRODUCT_DOCUMENT, batchSize: 1 }));
    await test.step("arrange: documents are being indexed", async () => {
      await expect
        .poll(async () => (await pushNotificationOf<IndexProgress>(api, started.id))?.processedCount, {
          timeout: PROCESSING_START_TIMEOUT_MS,
        })
        .toBeGreaterThan(0);
    });

    await test.step("act: cancel the indexation", async () =>
      (await api.get(`${INDEXES_PATH}/tasks/${started.jobId}/cancel`)).expectOk());

    await test.step("assert: the indexation stopped as canceled, before every document was processed", async () => {
      await expect
        .poll(async () => (await pushNotificationOf<IndexProgress>(api, started.id))?.finished, {
          timeout: FULL_REBUILD_TIMEOUT_MS,
        })
        .toEqual(expect.any(String));
      const progress = requireFields(
        await pushNotificationOf<IndexProgress>(api, started.id),
        ["description", "processedCount", "totalCount"],
        "Canceled indexation",
      );
      expect(progress.description).toBe(CANCELED);
      expect(progress.processedCount).toBeLessThan(progress.totalCount);
    });
  });

  test("drop and rebuild the product index", async ({ api }) => {
    test.setTimeout(FULL_REBUILD_TIMEOUT_MS + 30_000);

    const started = await test.step("act: rebuild the product index from scratch", () =>
      startIndexation(api, { documentType: PRODUCT_DOCUMENT, deleteExistingIndex: true }));

    await test.step("assert: the rebuild completes without errors", async () => {
      await expect
        .poll(async () => (await pushNotificationOf<IndexProgress>(api, started.id))?.finished, {
          timeout: FULL_REBUILD_TIMEOUT_MS,
        })
        .toEqual(expect.any(String));
      expect(await pushNotificationOf<IndexProgress>(api, started.id)).toMatchObject({
        description: COMPLETED,
        errorCount: 0,
      });
    });
    await test.step(`assert: ${PRODUCT_ID} is indexed again`, async () => {
      const documents = (await api.get(`${INDEXES_PATH}/index/${PRODUCT_DOCUMENT}/${PRODUCT_ID}`))
        .expectOk()
        .json<unknown[]>();
      expect(documents).toHaveLength(1);
    });
  });
});

async function startIndexation(
  api: HttpClient,
  options: Readonly<Record<string, unknown>>,
): Promise<{ readonly id: string; readonly jobId: string }> {
  const progress = (await api.post(`${INDEXES_PATH}/index`, { json: [options] })).expectOk().json<IndexProgress>();
  return requireFields(progress, ["id", "jobId"], "Started indexation");
}
