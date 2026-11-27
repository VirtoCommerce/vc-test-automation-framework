import type {
  VirtoCommerceCatalogPublishingModuleCoreModelSearchCompletenessChannelSearchResult as ChannelSearchResult,
  VirtoCommerceCatalogPublishingModuleCoreModelCompletenessChannel as CompletenessChannel,
  VirtoCommerceCatalogPublishingModuleCoreModelCompletenessEntry as CompletenessEntry,
  VirtoCommerceCatalogPublishingModuleWebModelEvaluateCompletenessNotification as EvaluationNotification,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { DEFAULT_COMPLETENESS_EVALUATOR, newCompletenessChannel } from "@builders/completeness.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { pushNotificationOf } from "@support/push-notifications.ts";
import { requireFields } from "@support/require-fields.ts";
import { PLATFORM_DEFECT_TAG } from "@virtocommerce/test-automation-framework/core";

const COMPLETENESS_PATH = "/api/completeness";
const CHANNELS_PATH = `${COMPLETENESS_PATH}/channels`;
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

test.describe("completeness channels (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("create a channel", async ({ api, arrange, dataset, store }) => {
    const draft = newCompletenessChannel(store, dataset.catalogs.get(store.catalog).name ?? null);
    arrange.catalog.deleteCompletenessChannelLater(draft.id);

    const channel = await test.step("act: create a channel", async () =>
      (await api.post(CHANNELS_PATH, { json: draft })).expectOk().json<CompletenessChannel>());

    await test.step("assert: the channel covers the store's catalog", () => {
      expect(channel).toMatchObject({ name: draft.name, catalogId: store.catalog });
    });
  });

  test("get a channel by id", async ({ api, arrange }) => {
    const channel = await test.step("arrange: a channel", () => arrange.catalog.completenessChannel());

    const reloaded = await test.step("act: get the channel", () => channelOf(api, channel.id));

    await test.step("assert: the fields match the created channel", () => {
      expect(reloaded).toMatchObject({ id: channel.id, name: channel.name, catalogId: channel.catalogId });
    });
  });

  test("search channels by id", {
    tag: PLATFORM_DEFECT_TAG,
    annotation: { type: "issue", description: "https://virtocommerce.atlassian.net/browse/VCST-6441" },
  }, async ({ api, arrange }) => {
    test.fail(true, "VCST-6441: the completeness channel search ignores the id filter");
    const [channel] = await test.step("arrange: two channels", async () => [
      await arrange.catalog.completenessChannel(),
      await arrange.catalog.completenessChannel(),
    ]);

    const found = await test.step("act: search channels by the first channel's id", async () =>
      (await api.post(`${CHANNELS_PATH}/search`, { json: { objectIds: [channel.id] } }))
        .expectOk()
        .json<ChannelSearchResult>().results ?? []);

    await test.step("assert: exactly the first channel is found", () => {
      expect(found.map(({ id }) => id)).toEqual([channel.id]);
    });
  });

  test("rename a channel", async ({ api, arrange }) => {
    const channel = await test.step("arrange: a channel", () => arrange.catalog.completenessChannel());
    const newName = `${channel.name}-renamed`;

    await test.step("act: rename the channel", async () =>
      (await api.put(CHANNELS_PATH, { json: { ...channel, name: newName } })).expectOk());

    await test.step("assert: the channel has the new name", async () => {
      expect((await channelOf(api, channel.id))?.name).toBe(newName);
    });
  });

  test("delete a channel", async ({ api, arrange }) => {
    const channel = await test.step("arrange: a channel", () => arrange.catalog.completenessChannel());

    await test.step("act: delete the channel", async () =>
      (await api.delete(CHANNELS_PATH, { query: { ids: [channel.id] } })).expectOk());

    await test.step("assert: the channel is not found", async () => {
      expect(await channelOf(api, channel.id)).toBeUndefined();
    });
  });

  test("list the completeness evaluators", async ({ api }) => {
    const evaluators = await test.step("act: list the evaluators", async () =>
      (await api.get(`${COMPLETENESS_PATH}/evaluators`)).expectOk().json<string[]>());

    await test.step(`assert: ${DEFAULT_COMPLETENESS_EVALUATOR} is offered`, () => {
      expect(evaluators).toContain(DEFAULT_COMPLETENESS_EVALUATOR);
    });
  });

  test("evaluate the completeness of a channel", async ({ api, arrange }) => {
    const channel = await test.step("arrange: a channel", () => arrange.catalog.completenessChannel());

    const evaluation = await test.step("act: evaluate the channel", async () =>
      requireFields(
        (await api.post(`${CHANNELS_PATH}/${channel.id}/evaluate`)).expectOk().json<EvaluationNotification>(),
        ["id"],
        `The evaluation of ${channel.name}`,
      ));

    await test.step("assert: every product of the catalog is evaluated without errors", async () => {
      await expect
        .poll(async () => (await pushNotificationOf<EvaluationNotification>(api, evaluation.id))?.finished, {
          timeout: EVALUATION_TIMEOUT_MS,
        })
        .toEqual(expect.any(String));
      const { totalCount, processedCount, errors } = requireFields(
        await pushNotificationOf<EvaluationNotification>(api, evaluation.id),
        ["totalCount", "processedCount"],
        "Finished evaluation",
      );
      expect(totalCount).toBeGreaterThan(0);
      expect({ processedCount, errors: errors ?? [] }).toEqual({ processedCount: totalCount, errors: [] });
    });
    await test.step("assert: the channel stores a percent between 0 and 100", async () => {
      const completenessPercent = (await channelOf(api, channel.id))?.completenessPercent;
      expect(completenessPercent).toBeGreaterThanOrEqual(0);
      expect(completenessPercent).toBeLessThanOrEqual(100);
    });
  });

  test("evaluate the completeness of a product", async ({ api, arrange }) => {
    const channel = await test.step("arrange: a channel", () => arrange.catalog.completenessChannel());

    const entries = await test.step(`act: evaluate ${PRODUCT_ID}`, () =>
      evaluateProducts(api, channel.id, [PRODUCT_ID]));

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
    const channel = await test.step("arrange: a channel", () => arrange.catalog.completenessChannel());
    const entries = await test.step(`arrange: ${PRODUCT_ID} evaluated`, () =>
      evaluateProducts(api, channel.id, [PRODUCT_ID]));

    await test.step("act: save the evaluated entries", async () =>
      (await api.put(`${COMPLETENESS_PATH}/entries`, { json: entries })).expectOk());

    await test.step("assert: the channel has the product's completeness", async () => {
      expect(entries.map(({ productId }) => productId)).toEqual([PRODUCT_ID]);
      expect((await channelOf(api, channel.id))?.completenessPercent).toBe(entries[0]?.completenessPercent);
    });
  });
});

async function channelOf(api: HttpClient, id: string): Promise<CompletenessChannel | undefined> {
  return (await api.get(`${CHANNELS_PATH}/${id}`)).optionalJson<CompletenessChannel>({ allow404: true });
}

async function evaluateProducts(
  api: HttpClient,
  channelId: string,
  productIds: readonly string[],
): Promise<CompletenessEntry[]> {
  const response = await api.post(`${CHANNELS_PATH}/${channelId}/products/evaluate`, { json: productIds });
  return response.expectOk().json<CompletenessEntry[]>();
}
