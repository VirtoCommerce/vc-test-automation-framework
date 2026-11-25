import * as allure from "allure-js-commons";

import { requireFields } from "@core/required-fields";
import { expect, test } from "@fixtures";

const PRODUCT_DOCUMENT = "Product";
const PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";
const COMPLETED = "Indexation completed successfully";
const CANCELED = "Indexation has been canceled";
const JOB_STATES = ["Enqueued", "Scheduled", "Awaiting", "Processing", "Succeeded"];
const INDEXATION_TIMEOUT_MS = 30_000;
const PROCESSING_START_TIMEOUT_MS = 60_000;
const FULL_REBUILD_TIMEOUT_MS = 300_000;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Search / Indexes");
});

test.describe("search indexes (store administrator, whole index)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("cancel a running indexation", async ({ api }) => {
    test.setTimeout(FULL_REBUILD_TIMEOUT_MS + 30_000);
    await allure.story("Indexation");
    await allure.description("A full reindex canceled while it runs stops before every document is processed.");
    const started = await test.step("arrange: a full product reindex, one document per batch", () =>
      api.rest.searchIndexes.startIndexation([{ documentType: PRODUCT_DOCUMENT, batchSize: 1 }]));
    await test.step("arrange: documents are being indexed", async () => {
      await expect
        .poll(async () => (await api.rest.searchIndexes.findProgress(started.id))?.processedCount, {
          timeout: PROCESSING_START_TIMEOUT_MS,
        })
        .toBeGreaterThan(0);
    });

    await test.step("act: cancel the indexation", () => api.rest.searchIndexes.cancelIndexation(started.jobId));

    await test.step("assert: the indexation stopped as canceled, before every document was processed", async () => {
      await expect
        .poll(async () => (await api.rest.searchIndexes.findProgress(started.id))?.finished, {
          timeout: FULL_REBUILD_TIMEOUT_MS,
        })
        .toEqual(expect.any(String));
      const progress = requireFields(
        await api.rest.searchIndexes.getProgress(started.id),
        ["description", "processedCount", "totalCount"],
        "Canceled indexation",
      );
      expect(progress.description).toBe(CANCELED);
      expect(progress.processedCount).toBeLessThan(progress.totalCount);
    });
  });

  test("drop and rebuild the product index", async ({ api }) => {
    test.setTimeout(FULL_REBUILD_TIMEOUT_MS + 30_000);
    await allure.story("Indexation");
    await allure.description("The product index rebuilt from scratch completes without errors and has the products.");

    const started = await test.step("act: rebuild the product index from scratch", () =>
      api.rest.searchIndexes.startIndexation([{ documentType: PRODUCT_DOCUMENT, deleteExistingIndex: true }]));

    await test.step("assert: the rebuild completes without errors", async () => {
      await expect
        .poll(async () => (await api.rest.searchIndexes.findProgress(started.id))?.finished, {
          timeout: FULL_REBUILD_TIMEOUT_MS,
        })
        .toEqual(expect.any(String));
      expect(await api.rest.searchIndexes.getProgress(started.id)).toMatchObject({
        description: COMPLETED,
        errorCount: 0,
      });
    });
    await test.step(`assert: ${PRODUCT_ID} is indexed again`, async () => {
      expect(await api.rest.searchIndexes.getDocuments(PRODUCT_DOCUMENT, PRODUCT_ID)).toHaveLength(1);
    });
  });
});

test.describe("search indexes (store administrator, one product)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("reindex a product through a background job", async ({ api }) => {
    await allure.story("Indexation");
    await allure.description(
      "Reindexing one product runs as a background job that reports its state, completes without errors and " +
        "indexes the product anew.",
    );
    const indexedBefore = await test.step("arrange: the product's current indexation date", async () => {
      const [document] = await api.rest.searchIndexes.getDocuments(PRODUCT_DOCUMENT, PRODUCT_ID);
      return Date.parse(String(requireFields(document, ["indexationdate"], `Indexed ${PRODUCT_ID}`).indexationdate));
    });

    const started = await test.step(`act: reindex ${PRODUCT_ID}`, () =>
      api.rest.searchIndexes.startIndexation([{ documentType: PRODUCT_DOCUMENT, documentIds: [PRODUCT_ID] }]));

    await test.step("assert: the job reports a background job state", async () => {
      const job = await api.rest.jobs.get(started.jobId);
      expect(job).toMatchObject({ id: started.jobId, completed: expect.any(Boolean) });
      expect(JOB_STATES).toContain(job.state);
    });
    await test.step("assert: the job completes and the indexation has no errors", async () => {
      await expect
        .poll(async () => (await api.rest.jobs.get(started.jobId)).completed, { timeout: INDEXATION_TIMEOUT_MS })
        .toBe(true);
      await expect
        .poll(async () => (await api.rest.searchIndexes.findProgress(started.id))?.finished, {
          timeout: INDEXATION_TIMEOUT_MS,
        })
        .toEqual(expect.any(String));
      expect(await api.rest.searchIndexes.getProgress(started.id)).toMatchObject({
        description: COMPLETED,
        errorCount: 0,
      });
    });
    await test.step("assert: the product is indexed anew", async () => {
      const [document] = await api.rest.searchIndexes.getDocuments(PRODUCT_DOCUMENT, PRODUCT_ID);
      expect(
        Date.parse(String(requireFields(document, ["indexationdate"], `Indexed ${PRODUCT_ID}`).indexationdate)),
      ).toBeGreaterThan(indexedBefore);
    });
  });
});
