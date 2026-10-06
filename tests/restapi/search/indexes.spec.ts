import type { IndexProgressNotification } from "@api/rest/types/search";

import * as allure from "allure-js-commons";

import { HttpError } from "@api/http/http-error";
import { JobsClient } from "@api/rest/clients/jobs-client";
import { SearchIndexesClient } from "@api/rest/clients/search-indexes-client";
import { requireFields } from "@core/required-fields";
import { SEEDED_PRODUCTS } from "@dataset/seeded";
import { asWorkerAdministrator, expect, test } from "@fixtures";

const PRODUCT_DOCUMENT_TYPE = "Product";
const INDEXED_PRODUCT_ID = SEEDED_PRODUCTS.configurableLaptop;
const JOB_STATES = ["Enqueued", "Scheduled", "Awaiting", "Processing", "Succeeded"];
const SINGLE_DOCUMENT_TIMEOUT_MS = 30_000;
const PROCESSING_START_TIMEOUT_MS = 60_000;
const FULL_REBUILD_TIMEOUT_MS = 300_000;
const COMPLETED = "Indexation completed successfully";
const CANCELED = "Indexation has been canceled";

test.beforeEach(async () => {
  await allure.feature("Search / Indexes");
});

test.describe("search indexes (admin)", () => {
  test.describe.configure({ mode: "default" });
  test.use({ user: asWorkerAdministrator });

  test("list indexes", async ({ httpClient }) => {
    const searchIndexesClient = new SearchIndexesClient(httpClient);

    const indexes = await test.step("act: get indexes", () => searchIndexesClient.list());

    await test.step("assert: product index is listed", async () => {
      expect(indexes.map(({ documentType }) => documentType)).toContain(PRODUCT_DOCUMENT_TYPE);
    });
  });

  test("get an indexed product document", async ({ httpClient }) => {
    const searchIndexesClient = new SearchIndexesClient(httpClient);

    const documents = await test.step("act: get product document", () =>
      searchIndexesClient.getDocuments(PRODUCT_DOCUMENT_TYPE, INDEXED_PRODUCT_ID));

    await test.step("assert: the product's document is found", async () => {
      expect(documents).toEqual([expect.objectContaining({ code: INDEXED_PRODUCT_ID })]);
    });
  });

  test("reindex a product", async ({ httpClient }) => {
    const searchIndexesClient = new SearchIndexesClient(httpClient);
    const indexedBefore = await test.step("arrange: the product's current indexation date", () =>
      indexationDateOf(searchIndexesClient, INDEXED_PRODUCT_ID));

    const started = await test.step("act: start product indexation", () =>
      searchIndexesClient.startIndexation([
        { documentType: PRODUCT_DOCUMENT_TYPE, documentIds: [INDEXED_PRODUCT_ID] },
      ]));

    await test.step("assert: indexation completes without errors", async () => {
      const progress = await waitUntilFinished(searchIndexesClient, started, SINGLE_DOCUMENT_TIMEOUT_MS);
      expect(progress).toMatchObject({ description: COMPLETED, errorCount: 0 });
    });

    await test.step("assert: the product's document is indexed again", async () => {
      expect(await indexationDateOf(searchIndexesClient, INDEXED_PRODUCT_ID)).toBeGreaterThan(indexedBefore);
    });
  });

  test("get the status of an indexation's background job", async ({ httpClient }) => {
    const searchIndexesClient = new SearchIndexesClient(httpClient);
    const jobsClient = new JobsClient(httpClient);
    const started = await test.step("arrange: started product indexation", () =>
      searchIndexesClient.startIndexation([
        { documentType: PRODUCT_DOCUMENT_TYPE, documentIds: [INDEXED_PRODUCT_ID] },
      ]));

    const job = await test.step("act: get job status", () => jobsClient.get(started.jobId));

    await test.step("assert: job reports a background job state", async () => {
      expect(job).toMatchObject({ id: started.jobId, completed: expect.any(Boolean) });
      expect(JOB_STATES).toContain(job.state);
    });

    await test.step("assert: the job reaches a completed state with its indexation finished", async () => {
      await waitUntilFinished(searchIndexesClient, started, SINGLE_DOCUMENT_TIMEOUT_MS);
      await expect.poll(async () => (await jobsClient.get(started.jobId)).completed).toBe(true);
    });
  });

  test("cancel a running indexation", { tag: "@destructive" }, async ({ httpClient }) => {
    test.setTimeout(FULL_REBUILD_TIMEOUT_MS + 30_000);
    const searchIndexesClient = new SearchIndexesClient(httpClient);
    const started = await test.step("arrange: full product reindex, one document per batch", () =>
      searchIndexesClient.startIndexation([{ documentType: PRODUCT_DOCUMENT_TYPE, batchSize: 1 }]));
    await test.step("arrange: wait until documents are being indexed", async () => {
      await expect
        .poll(async () => (await searchIndexesClient.findProgress(started.id))?.processedCount, {
          timeout: PROCESSING_START_TIMEOUT_MS,
        })
        .toBeGreaterThan(0);
    });

    await test.step("act: cancel the indexation", async () => {
      try {
        await searchIndexesClient.cancelIndexation(started.jobId);
      } catch (error) {
        test.skip(error instanceof HttpError && error.status === 501, "The platform's job storage cannot cancel jobs");
        throw error;
      }
    });

    await test.step("assert: indexation stopped as canceled before every document was processed", async () => {
      const progress = requireFields(
        await waitUntilFinished(searchIndexesClient, started, FULL_REBUILD_TIMEOUT_MS),
        ["description", "processedCount", "totalCount"],
        "Canceled indexation progress",
      );
      expect(progress.description).toBe(CANCELED);
      expect(progress.processedCount).toBeLessThan(progress.totalCount);
    });
  });

  test("drop and rebuild the product index", { tag: "@destructive" }, async ({ httpClient }) => {
    test.setTimeout(FULL_REBUILD_TIMEOUT_MS + 30_000);
    const searchIndexesClient = new SearchIndexesClient(httpClient);

    const started = await test.step("act: rebuild product index from scratch", () =>
      searchIndexesClient.startIndexation([{ documentType: PRODUCT_DOCUMENT_TYPE, deleteExistingIndex: true }]));

    await test.step("assert: rebuild completes without errors", async () => {
      const progress = await waitUntilFinished(searchIndexesClient, started, FULL_REBUILD_TIMEOUT_MS);
      expect(progress).toMatchObject({ description: COMPLETED, errorCount: 0 });
    });

    await test.step("assert: products are indexed again", async () => {
      expect(await searchIndexesClient.getDocuments(PRODUCT_DOCUMENT_TYPE, INDEXED_PRODUCT_ID)).toHaveLength(1);
    });
  });
});

async function waitUntilFinished(
  searchIndexesClient: SearchIndexesClient,
  started: IndexProgressNotification,
  timeout: number,
): Promise<IndexProgressNotification> {
  await expect
    .poll(async () => (await searchIndexesClient.findProgress(started.id))?.finished, { timeout })
    .toEqual(expect.any(String));
  return searchIndexesClient.getProgress(started.id);
}

async function indexationDateOf(searchIndexesClient: SearchIndexesClient, productId: string): Promise<number> {
  const [document] = await searchIndexesClient.getDocuments(PRODUCT_DOCUMENT_TYPE, productId);
  const { indexationdate } = requireFields(document, ["indexationdate"], `Indexed document of ${productId}`);
  return Date.parse(String(indexationdate));
}
