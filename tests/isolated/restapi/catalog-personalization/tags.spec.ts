import type { CatalogProduct, Category } from "@api/rest/types/catalog";

import * as allure from "allure-js-commons";

import { uniqueId } from "@core/unique-id";
import { taggedCategory, taggedProduct } from "@dataset/builders/personalization";
import { expect, test } from "@fixtures";

const MEMBER_GROUPS_SETTING = "Customer.MemberGroups";
const INHERITANCE_POLICY_SETTING = "CatalogPersonalization.TagsInheritancePolicy";
const SYNCHRONIZATION_TIMEOUT_MS = 60_000;

interface ProductInCategory {
  readonly category: Category;
  readonly product: CatalogProduct;
}

const INHERITANCE_POLICIES = [
  {
    policy: "DownTree",
    tagged: "category",
    inheriting: "product",
    taggedEntity: ({ category }: ProductInCategory) => taggedCategory(category),
    inheritingId: ({ product }: ProductInCategory) => product.id,
  },
  {
    policy: "UpTree",
    tagged: "product",
    inheriting: "category",
    taggedEntity: ({ product }: ProductInCategory) => taggedProduct(product),
    inheritingId: ({ category }: ProductInCategory) => category.id,
  },
] as const;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Catalog Personalization / Tags");
});

test.describe("personalization settings (store administrator, global settings)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("a tag added to the member groups is listed as a member group", async ({ api, arrange }) => {
    await allure.story("Member groups");
    await allure.description(`A value added to ${MEMBER_GROUPS_SETTING} is one of the member groups tags draw on.`);
    const group = uniqueId("test-group");
    await test.step(`arrange: add ${group} to ${MEMBER_GROUPS_SETTING}`, () =>
      arrange.platform.allowedValue(MEMBER_GROUPS_SETTING, group));

    const groups = await test.step("act: get the member groups", () =>
      api.rest.settings.getValues(MEMBER_GROUPS_SETTING));

    await test.step(`assert: ${group} is a member group`, () => {
      expect(groups).toContain(group);
    });
  });

  for (const { policy, tagged, inheriting, taggedEntity, inheritingId } of INHERITANCE_POLICIES) {
    test(`with the ${policy} policy, a ${inheriting} inherits the tag of its ${tagged}`, async ({
      api,
      arrange,
      cleanup,
    }) => {
      await allure.story("Inheritance");
      await allure.description(
        `With ${INHERITANCE_POLICY_SETTING} ${policy}, a ${tagged}'s tag is inherited by its ${inheriting}.`,
      );
      await test.step(`arrange: the ${policy} inheritance policy`, () =>
        arrange.platform.setting(INHERITANCE_POLICY_SETTING, policy));
      const tree = await test.step("arrange: a product in a category", async () => {
        const category = await arrange.catalog.category((await arrange.catalog.catalog()).id);
        return { category, product: await arrange.catalog.product(category) };
      });
      const entity = taggedEntity(tree);
      const tag = uniqueId("test-tag");

      await test.step(`act: tag the ${tagged}`, () => api.rest.personalization.taggedItems.setTags(entity, [tag]));
      cleanup.push(`clear the tags of ${entity.label}`, () => api.rest.personalization.taggedItems.setTags(entity, []));

      await test.step(`assert: the ${inheriting} inherits the tag`, async () => {
        expect((await api.rest.personalization.taggedItems.get(inheritingId(tree))).inheritedTags).toContain(tag);
      });
    });
  }

  test("synchronize the catalog outlines", async ({ api, arrange }) => {
    await allure.story("Inheritance");
    await allure.description("Synchronizing the outlines tags are inherited along finishes without errors.");
    await test.step("arrange: the UpTree inheritance policy", () =>
      arrange.platform.setting(INHERITANCE_POLICY_SETTING, "UpTree"));

    const started = await test.step("act: start the outlines synchronization", () =>
      api.rest.personalization.synchronizeOutlines());

    await test.step("assert: the synchronization finishes without errors", async () => {
      await expect
        .poll(async () => (await api.rest.personalization.findSynchronization(started.id))?.finished, {
          timeout: SYNCHRONIZATION_TIMEOUT_MS,
        })
        .toEqual(expect.any(String));
      expect(await api.rest.personalization.findSynchronization(started.id)).toMatchObject({
        errorCount: 0,
        errors: [],
      });
    });
  });
});
