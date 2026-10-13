import * as allure from "allure-js-commons";

import { requireFields } from "@core/required-fields";
import { DEFAULT_COMPLETENESS_EVALUATOR, newCompletenessChannel } from "@dataset/builders/completeness";
import { KNOWN_ISSUES } from "@dataset/known-issues";
import { expect, knownIssue, test } from "@fixtures";

const PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";
const PRODUCT_COMPLETENESS = {
  percent: 75,
  details: [
    ["Properties", 100],
    ["Descriptions", 0],
    ["Prices", 100],
    ["Seo", 100],
  ],
} as const;
const EVALUATION_TIMEOUT_MS = 30_000;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Catalog Publishing / Completeness Channels");
});

test.describe("completeness channels (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("create a channel", async ({ api, cleanup, dataset, store }) => {
    await allure.story("Create");
    await allure.description("A new channel evaluates the store's catalog.");
    const draft = newCompletenessChannel(store, dataset.catalogs.get(store.catalog));
    cleanup.push(`delete completeness channel ${draft.name}`, () => api.rest.completeness.channels.delete([draft.id]));

    const channel = await test.step("act: create a channel", () => api.rest.completeness.channels.create(draft));

    await test.step("assert: the channel covers the store's catalog", () => {
      expect(channel).toMatchObject({ name: draft.name, catalogId: store.catalog });
    });
  });

  test("get a channel by id", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("A channel is read back by its id with the fields it was created with.");
    const channel = await test.step("arrange: a channel", () => arrange.catalog.completenessChannel());

    const reloaded = await test.step("act: get the channel", () => api.rest.completeness.channels.get(channel.id));

    await test.step("assert: the fields match the created channel", () => {
      expect(reloaded).toMatchObject({ id: channel.id, name: channel.name, catalogId: channel.catalogId });
    });
  });

  test("search channels by id", async ({ api, arrange }) => {
    await knownIssue(KNOWN_ISSUES.channelSearchIgnoresFilters);
    await allure.story("Search");
    await allure.description("Searching channels by one channel's id finds that channel and not another one.");
    const [channel] = await test.step("arrange: two channels", async () => [
      await arrange.catalog.completenessChannel(),
      await arrange.catalog.completenessChannel(),
    ]);

    const found = await test.step("act: search channels by the first channel's id", () =>
      api.rest.completeness.channels.search({ objectIds: [channel.id] }));

    await test.step("assert: exactly the first channel is found", () => {
      expect(found.map(({ id }) => id)).toEqual([channel.id]);
    });
  });

  test("rename a channel", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("A renamed channel is read back with its new name.");
    const channel = await test.step("arrange: a channel", () => arrange.catalog.completenessChannel());
    const newName = `${channel.name}-renamed`;

    await test.step("act: rename the channel", () =>
      api.rest.completeness.channels.update({ ...channel, name: newName }));

    await test.step("assert: the channel has the new name", async () => {
      expect((await api.rest.completeness.channels.get(channel.id)).name).toBe(newName);
    });
  });

  test("delete a channel", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A deleted channel is no longer found.");
    const channel = await test.step("arrange: a channel", () => arrange.catalog.completenessChannel());

    await test.step("act: delete the channel", () => api.rest.completeness.channels.delete([channel.id]));

    await test.step("assert: the channel is not found", async () => {
      expect(await api.rest.completeness.channels.find(channel.id)).toBeUndefined();
    });
  });

  test("list the completeness evaluators", async ({ api }) => {
    await allure.story("Evaluation");
    await allure.description("The platform offers the default completeness evaluator.");

    const evaluators = await test.step("act: list the evaluators", () => api.rest.completeness.listEvaluators());

    await test.step(`assert: ${DEFAULT_COMPLETENESS_EVALUATOR} is offered`, () => {
      expect(evaluators).toContain(DEFAULT_COMPLETENESS_EVALUATOR);
    });
  });

  test("evaluate the completeness of a channel", async ({ api, arrange }) => {
    await allure.story("Evaluation");
    await allure.description(
      "Evaluating a channel processes every product of its catalog without errors and stores a percent.",
    );
    const channel = await test.step("arrange: a channel", () => arrange.catalog.completenessChannel());

    const evaluation = await test.step("act: evaluate the channel", () =>
      api.rest.completeness.channels.evaluate(channel.id));

    await test.step("assert: every product of the catalog is evaluated without errors", async () => {
      await expect
        .poll(async () => (await api.rest.completeness.findEvaluation(evaluation.id))?.finished, {
          timeout: EVALUATION_TIMEOUT_MS,
        })
        .toEqual(expect.any(String));
      const { totalCount, processedCount, errorCount } = requireFields(
        await api.rest.completeness.findEvaluation(evaluation.id),
        ["totalCount", "processedCount", "errorCount"],
        "Finished evaluation",
      );
      expect(totalCount).toBeGreaterThan(0);
      expect({ processedCount, errorCount }).toEqual({ processedCount: totalCount, errorCount: 0 });
    });
    await test.step("assert: the channel stores a percent between 0 and 100", async () => {
      const { completenessPercent } = await api.rest.completeness.channels.get(channel.id);
      expect(completenessPercent).toBeGreaterThanOrEqual(0);
      expect(completenessPercent).toBeLessThanOrEqual(100);
    });
  });

  test("evaluate the completeness of a product", async ({ api, arrange }) => {
    await allure.story("Evaluation");
    await allure.description(
      `${PRODUCT_ID} is ${PRODUCT_COMPLETENESS.percent}% complete: it has properties, prices and SEO, ` +
        "but no descriptions.",
    );
    const channel = await test.step("arrange: a channel", () => arrange.catalog.completenessChannel());

    const entries = await test.step(`act: evaluate ${PRODUCT_ID}`, () =>
      api.rest.completeness.channels.evaluateProducts(channel.id, [PRODUCT_ID]));

    await test.step(`assert: the product is ${PRODUCT_COMPLETENESS.percent}% complete, detail by detail`, () => {
      expect(entries).toEqual([
        expect.objectContaining({
          channelId: channel.id,
          productId: PRODUCT_ID,
          completenessPercent: PRODUCT_COMPLETENESS.percent,
          details: PRODUCT_COMPLETENESS.details.map(([name, completenessPercent]) =>
            expect.objectContaining({ name, completenessPercent }),
          ),
        }),
      ]);
    });
  });

  test("save the evaluated completeness of a product", async ({ api, arrange }) => {
    await allure.story("Evaluation");
    await allure.description("A channel takes the completeness of the one product whose evaluation is saved to it.");
    const channel = await test.step("arrange: a channel", () => arrange.catalog.completenessChannel());
    const entries = await test.step(`arrange: ${PRODUCT_ID} evaluated`, () =>
      api.rest.completeness.channels.evaluateProducts(channel.id, [PRODUCT_ID]));

    await test.step("act: save the evaluated entries", () => api.rest.completeness.entries.saveMany(entries));

    await test.step("assert: the channel has the product's completeness", async () => {
      expect(entries.map(({ productId }) => productId)).toEqual([PRODUCT_ID]);
      expect((await api.rest.completeness.channels.get(channel.id)).completenessPercent).toBe(
        entries[0]?.completenessPercent,
      );
    });
  });
});
