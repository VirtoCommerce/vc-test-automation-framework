import type {
  VirtoCommerceSearchModuleCoreModelIndexProgressPushNotification as IndexProgress,
  VirtoCommerceSearchModuleCoreModelIndexState as IndexState,
  VirtoCommercePlatformCoreJobsJob as Job,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { pushNotificationOf } from "@support/push-notifications.ts";
import { requireFields } from "@support/require-fields.ts";

const INDEXES_PATH = "/api/search/indexes";
const PRODUCT_DOCUMENT = "Product";
const PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";
const COMPLETED = "Indexation completed successfully";
const JOB_STATES = ["Enqueued", "Scheduled", "Awaiting", "Processing", "Succeeded"];
const INDEXATION_TIMEOUT_MS = 30_000;

type IndexedDocument = Readonly<Record<string, unknown>>;

test.describe("search indexes (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("list the indexes", async ({ api }) => {
    const indexes = await test.step("act: list the indexes", async () =>
      (await api.get(INDEXES_PATH)).expectOk().json<IndexState[]>());

    await test.step(`assert: the ${PRODUCT_DOCUMENT} index is listed`, () => {
      expect(indexes.map(({ documentType }) => documentType)).toContain(PRODUCT_DOCUMENT);
    });
  });

  test("get the indexed document of a product", async ({ api, dataset }) => {
    const { code } = requireFields(dataset.products.get(PRODUCT_ID), ["code"], PRODUCT_ID);

    const documents = await test.step(`act: get the documents of ${PRODUCT_ID}`, () => indexedDocuments(api));

    await test.step("assert: exactly one document, with the product's code", () => {
      expect(documents).toEqual([expect.objectContaining({ code })]);
    });
  });

  test("reindex a product through a background job", async ({ api }) => {
    const indexedBefore = await test.step("arrange: the product's current indexation date", async () =>
      indexationDate(await indexedDocuments(api)));

    const started = await test.step(`act: reindex ${PRODUCT_ID}`, async () => {
      const options = [{ documentType: PRODUCT_DOCUMENT, documentIds: [PRODUCT_ID] }];
      const progress = (await api.post(`${INDEXES_PATH}/index`, { json: options })).expectOk().json<IndexProgress>();
      return requireFields(progress, ["id", "jobId"], `The indexation of ${PRODUCT_ID}`);
    });

    await test.step("assert: the job reports a background job state", async () => {
      const job = await jobOf(api, started.jobId);
      expect(job).toMatchObject({ id: started.jobId, completed: expect.any(Boolean) });
      expect(JOB_STATES).toContain(job.state);
    });
    await test.step("assert: the job completes and the indexation has no errors", async () => {
      await expect
        .poll(async () => (await jobOf(api, started.jobId)).completed, { timeout: INDEXATION_TIMEOUT_MS })
        .toBe(true);
      await expect
        .poll(async () => (await pushNotificationOf<IndexProgress>(api, started.id))?.finished, {
          timeout: INDEXATION_TIMEOUT_MS,
        })
        .toEqual(expect.any(String));
      expect(await pushNotificationOf<IndexProgress>(api, started.id)).toMatchObject({
        description: COMPLETED,
        errorCount: 0,
      });
    });
    await test.step("assert: the product is indexed anew", async () => {
      expect(indexationDate(await indexedDocuments(api))).toBeGreaterThan(indexedBefore);
    });
  });
});

async function indexedDocuments(api: HttpClient): Promise<IndexedDocument[]> {
  const response = await api.get(`${INDEXES_PATH}/index/${PRODUCT_DOCUMENT}/${PRODUCT_ID}`);
  return response.expectOk().json<IndexedDocument[]>();
}

function indexationDate(documents: readonly IndexedDocument[]): number {
  return Date.parse(String(requireFields(documents[0], ["indexationdate"], `Indexed ${PRODUCT_ID}`).indexationdate));
}

async function jobOf(api: HttpClient, id: string): Promise<Job> {
  return (await api.get(`/api/platform/jobs/${id}`)).expectOk().json<Job>();
}
