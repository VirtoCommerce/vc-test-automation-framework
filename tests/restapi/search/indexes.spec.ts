import * as allure from "allure-js-commons";

import { requireFields } from "@core/required-fields";
import { expect, test } from "@fixtures";

const PRODUCT_DOCUMENT = "Product";
const PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";
const COMPLETED = "Indexation completed successfully";
const JOB_STATES = ["Enqueued", "Scheduled", "Awaiting", "Processing", "Succeeded"];
const INDEXATION_TIMEOUT_MS = 30_000;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Search / Indexes");
});

test.describe("search indexes (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("list the indexes", async ({ api }) => {
    await allure.story("Indexes");
    await allure.description("The product index is one of the platform's search indexes.");

    const indexes = await test.step("act: list the indexes", () => api.rest.searchIndexes.list());

    await test.step(`assert: the ${PRODUCT_DOCUMENT} index is listed`, () => {
      expect(indexes.map(({ documentType }) => documentType)).toContain(PRODUCT_DOCUMENT);
    });
  });

  test("get the indexed document of a product", async ({ api, dataset }) => {
    await allure.story("Documents");
    await allure.description(`${PRODUCT_ID} is indexed as exactly one document, with its code.`);
    const { code } = requireFields(dataset.products.get(PRODUCT_ID), ["code"], PRODUCT_ID);

    const documents = await test.step(`act: get the documents of ${PRODUCT_ID}`, () =>
      api.rest.searchIndexes.getDocuments(PRODUCT_DOCUMENT, PRODUCT_ID));

    await test.step("assert: exactly one document, with the product's code", () => {
      expect(documents).toEqual([expect.objectContaining({ code })]);
    });
  });

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
