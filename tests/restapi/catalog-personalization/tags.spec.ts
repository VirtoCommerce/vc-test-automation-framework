import type { Arrange } from "@dataset/arrange";

import * as allure from "allure-js-commons";

import { uniqueId } from "@core/unique-id";
import { taggedCategory, taggedProduct } from "@dataset/builders/personalization";
import { expect, test } from "@fixtures";

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

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Catalog Personalization / Tags");
});

test.describe("personalization tags (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  for (const { entity, arrangeEntity } of TAGGED_ENTITIES) {
    test(`assign a tag to a ${entity}`, async ({ api, arrange, cleanup }) => {
      await allure.story("Assign");
      await allure.description(`A tag assigned to a ${entity} is exactly the ${entity}'s tag.`);
      const tagged = await test.step(`arrange: a ${entity}`, () => arrangeEntity(arrange));
      const tag = uniqueId("test-tag");

      await test.step(`act: tag the ${entity}`, () => api.rest.personalization.taggedItems.setTags(tagged, [tag]));
      cleanup.push(`clear the tags of ${tagged.label}`, () => api.rest.personalization.taggedItems.setTags(tagged, []));

      await test.step(`assert: the ${entity} has exactly the tag`, async () => {
        expect((await api.rest.personalization.taggedItems.get(tagged.entityId)).tags).toEqual([tag]);
      });
    });
  }

  test("unassign the tags of a product", async ({ api, arrange }) => {
    await allure.story("Assign");
    await allure.description("Setting no tags on a tagged product leaves it without tags.");
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    await test.step("arrange: the product is tagged", () =>
      arrange.catalog.tags(taggedProduct(product), [uniqueId("test-tag")]));

    await test.step("act: clear the product's tags", () =>
      api.rest.personalization.taggedItems.setTags(taggedProduct(product), []));

    await test.step("assert: the product has no tags", async () => {
      expect((await api.rest.personalization.taggedItems.get(product.id)).tags).toEqual([]);
    });
  });

  test("search tagged items by entity id", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description("Searching tagged items by a product's id finds exactly the product with its tags.");
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const tag = uniqueId("test-tag");
    await test.step("arrange: the product is tagged", () => arrange.catalog.tags(taggedProduct(product), [tag]));

    const found = await test.step("act: search tagged items by the product's id", () =>
      api.rest.personalization.taggedItems.search({ entityIds: [product.id] }));

    await test.step("assert: the product is found with its tag", () => {
      expect(found).toEqual([expect.objectContaining({ entityId: product.id, tags: [tag] })]);
    });
  });

  test("count the tags of a product", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description("The tag count of a product is the number of tags assigned to it.");
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const tags = [uniqueId("test-tag"), uniqueId("test-tag")];
    await test.step("arrange: the product has two tags", () => arrange.catalog.tags(taggedProduct(product), tags));

    const count = await test.step("act: count the product's tags", () =>
      api.rest.personalization.taggedItems.countTags(product.id));

    await test.step(`assert: the count is ${tags.length}`, () => {
      expect(count).toBe(tags.length);
    });
  });
});
