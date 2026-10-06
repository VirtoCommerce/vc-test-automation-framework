import * as allure from "allure-js-commons";

import { CompletenessClient } from "@api/rest/clients/completeness-client";
import { requireFields } from "@core/required-fields";
import { DEFAULT_COMPLETENESS_EVALUATOR, newCompletenessChannel } from "@dataset/builders/completeness";
import { SEEDED_CATALOG_ID, SEEDED_PRODUCTS } from "@dataset/seeded";
import { asWorkerAdministrator, expect, test } from "@fixtures";

const SEEDED_PRODUCT_ID = SEEDED_PRODUCTS.configurableLaptop;
const EVALUATION_TIMEOUT_MS = 30_000;
const SEEDED_PRODUCT_COMPLETENESS = {
  percent: 75,
  details: [
    ["Properties", 100],
    ["Descriptions", 0],
    ["Prices", 100],
    ["Seo", 100],
  ],
} as const;

test.beforeEach(async () => {
  await allure.feature("Catalog / Publishing");
});

test.describe("completeness channels (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  test("create a channel", async ({ httpClient, cleanupStack }) => {
    const completenessClient = new CompletenessClient(httpClient);
    const draft = newCompletenessChannel();

    const channel = await test.step("act: create channel", () => completenessClient.createChannel(draft));
    cleanupStack.push(`delete channel ${channel.id}`, () => completenessClient.deleteChannel(channel.id));

    await test.step("assert: channel covers the seeded catalog", async () => {
      expect(channel).toMatchObject({ name: draft.name, catalogId: SEEDED_CATALOG_ID });
    });
  });

  test("rename a channel", async ({ httpClient, cleanupStack }) => {
    const completenessClient = new CompletenessClient(httpClient);
    const channel = await test.step("arrange: channel", () =>
      completenessClient.createChannel(newCompletenessChannel()));
    cleanupStack.push(`delete channel ${channel.id}`, () => completenessClient.deleteChannel(channel.id));
    const newName = `${channel.name}-renamed`;

    await test.step("act: rename channel", () => completenessClient.updateChannel({ ...channel, name: newName }));

    await test.step("assert: channel has the new name", async () => {
      expect((await completenessClient.getChannel(channel.id)).name).toBe(newName);
    });
  });

  test("get a channel by id", async ({ httpClient, cleanupStack }) => {
    const completenessClient = new CompletenessClient(httpClient);
    const channel = await test.step("arrange: channel", () =>
      completenessClient.createChannel(newCompletenessChannel()));
    cleanupStack.push(`delete channel ${channel.id}`, () => completenessClient.deleteChannel(channel.id));

    const reloaded = await test.step("act: get channel", () => completenessClient.getChannel(channel.id));

    await test.step("assert: fields match the created channel", async () => {
      expect(reloaded).toMatchObject({ id: channel.id, name: channel.name, catalogId: channel.catalogId });
    });
  });

  test("search channels", async ({ httpClient, cleanupStack }) => {
    const completenessClient = new CompletenessClient(httpClient);
    const channel = await test.step("arrange: channel", () =>
      completenessClient.createChannel(newCompletenessChannel()));
    cleanupStack.push(`delete channel ${channel.id}`, () => completenessClient.deleteChannel(channel.id));

    const found = await test.step("act: search channels", () => completenessClient.searchChannels({ take: 1000 }));

    await test.step("assert: channel is in the results", async () => {
      expect(found.map(({ id }) => id)).toContain(channel.id);
    });
  });

  test("delete a channel", async ({ httpClient, cleanupStack }) => {
    const completenessClient = new CompletenessClient(httpClient);
    const channel = await test.step("arrange: channel", () =>
      completenessClient.createChannel(newCompletenessChannel()));
    cleanupStack.push(`delete channel ${channel.id}`, () => completenessClient.deleteChannel(channel.id));

    await test.step("act: delete channel", () => completenessClient.deleteChannel(channel.id));

    await test.step("assert: channel is not found", async () => {
      expect(await completenessClient.findChannel(channel.id)).toBeUndefined();
    });
  });

  test("list completeness evaluators", async ({ httpClient }) => {
    const completenessClient = new CompletenessClient(httpClient);

    const evaluators = await test.step("act: list evaluators", () => completenessClient.listEvaluators());

    await test.step("assert: default evaluator is available", async () => {
      expect(evaluators).toContain(DEFAULT_COMPLETENESS_EVALUATOR);
    });
  });

  test("evaluate channel completeness", async ({ httpClient, cleanupStack }) => {
    const completenessClient = new CompletenessClient(httpClient);
    const channel = await test.step("arrange: channel", () =>
      completenessClient.createChannel(newCompletenessChannel()));
    cleanupStack.push(`delete channel ${channel.id}`, () => completenessClient.deleteChannel(channel.id));

    const evaluation = await test.step("act: evaluate channel", () => completenessClient.evaluateChannel(channel.id));

    await test.step("assert: every product of the catalog is evaluated without errors", async () => {
      await expect
        .poll(async () => (await completenessClient.findEvaluation(evaluation.id))?.finished, {
          timeout: EVALUATION_TIMEOUT_MS,
        })
        .toEqual(expect.any(String));
      const { totalCount, processedCount, errorCount } = requireFields(
        await completenessClient.findEvaluation(evaluation.id),
        ["totalCount", "processedCount", "errorCount"],
        "Finished evaluation",
      );
      expect(totalCount).toBeGreaterThan(0);
      expect({ processedCount, errorCount }).toEqual({ processedCount: totalCount, errorCount: 0 });
    });
    await test.step("assert: the channel stores a percent between 0 and 100", async () => {
      const { completenessPercent } = await completenessClient.getChannel(channel.id);
      expect(completenessPercent).toBeGreaterThanOrEqual(0);
      expect(completenessPercent).toBeLessThanOrEqual(100);
    });
  });

  test("evaluate product completeness", async ({ httpClient, cleanupStack }) => {
    const completenessClient = new CompletenessClient(httpClient);
    const channel = await test.step("arrange: channel", () =>
      completenessClient.createChannel(newCompletenessChannel()));
    cleanupStack.push(`delete channel ${channel.id}`, () => completenessClient.deleteChannel(channel.id));

    const entries = await test.step("act: evaluate seeded product", () =>
      completenessClient.evaluateProducts(channel.id, [SEEDED_PRODUCT_ID]));

    await test.step("assert: product gets a completeness percent in the channel", async () => {
      expect(entries).toEqual([
        expect.objectContaining({
          channelId: channel.id,
          productId: SEEDED_PRODUCT_ID,
          completenessPercent: SEEDED_PRODUCT_COMPLETENESS.percent,
          details: SEEDED_PRODUCT_COMPLETENESS.details.map(([name, completenessPercent]) =>
            expect.objectContaining({ name, completenessPercent }),
          ),
        }),
      ]);
    });
  });

  test("save evaluated product completeness", async ({ httpClient, cleanupStack }) => {
    const completenessClient = new CompletenessClient(httpClient);
    const channel = await test.step("arrange: channel", () =>
      completenessClient.createChannel(newCompletenessChannel()));
    cleanupStack.push(`delete channel ${channel.id}`, () => completenessClient.deleteChannel(channel.id));
    const entries = await test.step("arrange: evaluated seeded product", () =>
      completenessClient.evaluateProducts(channel.id, [SEEDED_PRODUCT_ID]));
    const savedPercent = requireFields(entries[0], ["completenessPercent"], "Evaluated entry").completenessPercent;

    await test.step("act: save completeness entries", () => completenessClient.saveEntries(entries));

    await test.step("assert: the channel takes the saved product completeness", async () => {
      expect(entries).toHaveLength(1);
      expect((await completenessClient.getChannel(channel.id)).completenessPercent).toBe(savedPercent);
    });
  });
});
