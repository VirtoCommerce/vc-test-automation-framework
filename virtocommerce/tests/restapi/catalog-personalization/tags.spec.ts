import type { Arrange } from "@arrange";
import type { TaggedEntity } from "@builders/personalization.ts";
import type {
  VirtoCommerceCatalogPersonalizationModuleCoreModelTaggedItem as TaggedItem,
  VirtoCommerceCatalogPersonalizationModuleCoreModelSearchTaggedItemSearchResult as TaggedItemSearchResult,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { taggedCategory, taggedProduct } from "@builders/personalization.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { setTags } from "@support/personalization.ts";
import { uniqueId } from "@support/unique-id.ts";

const TAGGED_ITEM_PATH = "/api/personalization/taggeditem";
const TAGGED_ENTITIES = [
  {
    entity: "product",
    arrangeEntity: async (arrange: Arrange) => taggedProduct(await arrange.catalog.catalogProduct()),
  },
  {
    entity: "category",
    arrangeEntity: async (arrange: Arrange) =>
      taggedCategory(await arrange.catalog.category((await arrange.catalog.catalog()).id)),
  },
] as const;

test.describe("personalization tags (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  for (const { entity, arrangeEntity } of TAGGED_ENTITIES) {
    test(`assign a tag to a ${entity}`, async ({ api, arrange }) => {
      const tagged = await test.step(`arrange: a ${entity}`, () => arrangeEntity(arrange));
      const tag = uniqueId("test-tag");
      arrange.catalog.clearTagsLater(tagged);

      await test.step(`act: tag the ${entity}`, () => setTags(api, tagged, [tag]));

      await test.step(`assert: the ${entity} has exactly the tag`, async () => {
        expect((await taggedItemOf(api, tagged)).tags).toEqual([tag]);
      });
    });
  }

  test("unassign the tags of a product", async ({ api, arrange }) => {
    const product = taggedProduct(await test.step("arrange: a product", () => arrange.catalog.catalogProduct()));
    await test.step("arrange: the product is tagged", () => arrange.catalog.tags(product, [uniqueId("test-tag")]));

    await test.step("act: clear the product's tags", () => setTags(api, product, []));

    await test.step("assert: the product has no tags", async () => {
      expect((await taggedItemOf(api, product)).tags).toEqual([]);
    });
  });

  test("search tagged items by entity id", async ({ api, arrange }) => {
    const product = taggedProduct(await test.step("arrange: a product", () => arrange.catalog.catalogProduct()));
    const tag = uniqueId("test-tag");
    await test.step("arrange: the product is tagged", () => arrange.catalog.tags(product, [tag]));

    const found = await test.step("act: search tagged items by the product's id", async () =>
      (await api.post("/api/personalization/search", { json: { entityIds: [product.entityId] } }))
        .expectOk()
        .json<TaggedItemSearchResult>().results ?? []);

    await test.step("assert: the product is found with its tag", () => {
      expect(found).toEqual([expect.objectContaining({ entityId: product.entityId, tags: [tag] })]);
    });
  });

  test("count the tags of a product", async ({ api, arrange }) => {
    const product = taggedProduct(await test.step("arrange: a product", () => arrange.catalog.catalogProduct()));
    const tags = [uniqueId("test-tag"), uniqueId("test-tag")];
    await test.step("arrange: the product has two tags", () => arrange.catalog.tags(product, tags));

    const count = await test.step("act: count the product's tags", async () =>
      (await api.get(`${TAGGED_ITEM_PATH}/${product.entityId}/tags/count`)).expectOk().json<number>());

    await test.step(`assert: the count is ${tags.length}`, () => {
      expect(count).toBe(tags.length);
    });
  });
});

async function taggedItemOf(api: HttpClient, entity: TaggedEntity): Promise<TaggedItem> {
  return (await api.get(`${TAGGED_ITEM_PATH}/${entity.entityId}`)).expectOk().json<TaggedItem>();
}
