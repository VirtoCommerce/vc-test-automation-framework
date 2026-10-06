import type { CatalogProduct, Category } from "@api/rest/types/catalog";
import type { TaggedEntity } from "@api/rest/types/personalization";
import type { CleanupStack } from "@core/cleanup-stack";

import * as allure from "allure-js-commons";

import { CatalogClient } from "@api/rest/clients/catalog-client";
import { PersonalizationClient } from "@api/rest/clients/personalization-client";
import { SettingsClient } from "@api/rest/clients/settings-client";
import { uniqueId } from "@core/unique-id";
import { createCategoryWithProduct } from "@dataset/arrange/catalog";
import {
  addSettingValue,
  arrangeSettingValue,
  registerSettingRestore,
  registerSettingValuesRemoval,
} from "@dataset/arrange/settings";
import { newCatalog, newCategory } from "@dataset/builders/catalog";
import { asWorkerAdministrator, expect, test } from "@fixtures";

const MEMBER_GROUPS_SETTING = "Customer.MemberGroups";
const INHERITANCE_POLICY_SETTING = "CatalogPersonalization.TagsInheritancePolicy";
const SYNCHRONIZATION_TIMEOUT_MS = 60_000;

test.beforeEach(async () => {
  await allure.feature("Catalog / Personalization");
});

test.describe("catalog personalization (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  test.describe("tags", () => {
    test("get member groups", async ({ httpClient, cleanupStack }) => {
      const settingsClient = new SettingsClient(httpClient);
      const group = uniqueId("test-group");
      await test.step(`arrange: member group ${group}`, () =>
        arrangeSettingValue(settingsClient, cleanupStack, MEMBER_GROUPS_SETTING, group));

      const groups = await test.step("act: get member groups", () => settingsClient.getValues(MEMBER_GROUPS_SETTING));

      await test.step("assert: the arranged group is listed", async () => {
        expect(groups).toContain(group);
      });
    });

    test("add a tag to the member groups", async ({ httpClient, cleanupStack }) => {
      const settingsClient = new SettingsClient(httpClient);
      const tag = uniqueId("test-tag");
      registerSettingValuesRemoval(settingsClient, cleanupStack, MEMBER_GROUPS_SETTING, [tag]);

      await test.step("act: add tag", () => addSettingValue(settingsClient, MEMBER_GROUPS_SETTING, tag));

      await test.step("assert: tag is a member group", async () => {
        expect(await settingsClient.getValues(MEMBER_GROUPS_SETTING)).toContain(tag);
      });
    });

    test("assign a tag to a product", async ({ httpClient, cleanupStack }) => {
      const catalogClient = new CatalogClient(httpClient);
      const personalizationClient = new PersonalizationClient(httpClient);
      const catalog = await test.step("arrange: catalog", () => catalogClient.saveCatalog(newCatalog()));
      cleanupStack.push(`delete catalog ${catalog.id}`, () => catalogClient.deleteCatalog(catalog.id));
      const { product } = await test.step("arrange: product", () =>
        createCategoryWithProduct(catalogClient, catalog.id));
      const tag = uniqueId("test-tag");

      await test.step("act: tag product", () => personalizationClient.setTags(productEntity(product), [tag]));

      await test.step("assert: product has the tag", async () => {
        expect((await personalizationClient.getTaggedItem(product.id)).tags).toEqual([tag]);
      });
    });

    test("assign a tag to a category", async ({ httpClient, cleanupStack }) => {
      const catalogClient = new CatalogClient(httpClient);
      const personalizationClient = new PersonalizationClient(httpClient);
      const catalog = await test.step("arrange: catalog", () => catalogClient.saveCatalog(newCatalog()));
      cleanupStack.push(`delete catalog ${catalog.id}`, () => catalogClient.deleteCatalog(catalog.id));
      const category = await test.step("arrange: category", () => catalogClient.saveCategory(newCategory(catalog.id)));
      const tag = uniqueId("test-tag");

      await test.step("act: tag category", () => personalizationClient.setTags(categoryEntity(category), [tag]));

      await test.step("assert: category has the tag", async () => {
        expect((await personalizationClient.getTaggedItem(category.id)).tags).toEqual([tag]);
      });
    });

    test("unassign a tag from a product", async ({ httpClient, cleanupStack }) => {
      const catalogClient = new CatalogClient(httpClient);
      const personalizationClient = new PersonalizationClient(httpClient);
      const catalog = await test.step("arrange: catalog", () => catalogClient.saveCatalog(newCatalog()));
      cleanupStack.push(`delete catalog ${catalog.id}`, () => catalogClient.deleteCatalog(catalog.id));
      const { product } = await test.step("arrange: product", () =>
        createCategoryWithProduct(catalogClient, catalog.id));
      await test.step("arrange: tagged product", () =>
        personalizationClient.setTags(productEntity(product), [uniqueId("test-tag")]));

      await test.step("act: clear tags", () => personalizationClient.setTags(productEntity(product), []));

      await test.step("assert: product has no tags", async () => {
        expect((await personalizationClient.getTaggedItem(product.id)).tags).toEqual([]);
      });
    });

    test("search tagged items by entity id", async ({ httpClient, cleanupStack }) => {
      const catalogClient = new CatalogClient(httpClient);
      const personalizationClient = new PersonalizationClient(httpClient);
      const catalog = await test.step("arrange: catalog", () => catalogClient.saveCatalog(newCatalog()));
      cleanupStack.push(`delete catalog ${catalog.id}`, () => catalogClient.deleteCatalog(catalog.id));
      const { product } = await test.step("arrange: product", () =>
        createCategoryWithProduct(catalogClient, catalog.id));
      const tag = uniqueId("test-tag");
      await test.step("arrange: tagged product", () => personalizationClient.setTags(productEntity(product), [tag]));

      const found = await test.step("act: search by product id", () =>
        personalizationClient.search({ entityIds: [product.id] }));

      await test.step("assert: product's tagged item is found", async () => {
        expect(found).toEqual([expect.objectContaining({ entityId: product.id, tags: [tag] })]);
      });
    });

    test("count product tags", async ({ httpClient, cleanupStack }) => {
      const catalogClient = new CatalogClient(httpClient);
      const personalizationClient = new PersonalizationClient(httpClient);
      const catalog = await test.step("arrange: catalog", () => catalogClient.saveCatalog(newCatalog()));
      cleanupStack.push(`delete catalog ${catalog.id}`, () => catalogClient.deleteCatalog(catalog.id));
      const { product } = await test.step("arrange: product", () =>
        createCategoryWithProduct(catalogClient, catalog.id));
      const tags = [uniqueId("test-tag"), uniqueId("test-tag")];
      await test.step("arrange: tagged product", () => personalizationClient.setTags(productEntity(product), tags));

      const count = await test.step("act: count tags", () => personalizationClient.countTags(product.id));

      await test.step("assert: count matches the assigned tags", async () => {
        expect(count).toBe(tags.length);
      });
    });
  });

  test.describe("tag inheritance", () => {
    test.describe.configure({ mode: "default" });

    test("category tag is inherited down the tree", async ({ httpClient, cleanupStack }) => {
      const catalogClient = new CatalogClient(httpClient);
      const personalizationClient = new PersonalizationClient(httpClient);
      const settingsClient = new SettingsClient(httpClient);
      await test.step("arrange: DownTree inheritance policy", () =>
        arrangeInheritancePolicy(settingsClient, cleanupStack, "DownTree"));
      const catalog = await test.step("arrange: catalog", () => catalogClient.saveCatalog(newCatalog()));
      cleanupStack.push(`delete catalog ${catalog.id}`, () => catalogClient.deleteCatalog(catalog.id));
      const { category, product } = await test.step("arrange: product in a category", () =>
        createCategoryWithProduct(catalogClient, catalog.id));
      const tag = uniqueId("test-tag");

      await test.step("act: tag category", () => personalizationClient.setTags(categoryEntity(category), [tag]));

      await test.step("assert: product inherits the tag", async () => {
        expect((await personalizationClient.getTaggedItem(product.id)).inheritedTags).toContain(tag);
      });
    });

    test("product tag is inherited up the tree", async ({ httpClient, cleanupStack }) => {
      const catalogClient = new CatalogClient(httpClient);
      const personalizationClient = new PersonalizationClient(httpClient);
      const settingsClient = new SettingsClient(httpClient);
      await test.step("arrange: UpTree inheritance policy", () =>
        arrangeInheritancePolicy(settingsClient, cleanupStack, "UpTree"));
      const catalog = await test.step("arrange: catalog", () => catalogClient.saveCatalog(newCatalog()));
      cleanupStack.push(`delete catalog ${catalog.id}`, () => catalogClient.deleteCatalog(catalog.id));
      const { category, product } = await test.step("arrange: product in a category", () =>
        createCategoryWithProduct(catalogClient, catalog.id));
      const tag = uniqueId("test-tag");

      await test.step("act: tag product", () => personalizationClient.setTags(productEntity(product), [tag]));

      await test.step("assert: category inherits the tag", async () => {
        expect((await personalizationClient.getTaggedItem(category.id)).inheritedTags).toContain(tag);
      });
    });

    test("synchronize outlines", async ({ httpClient, cleanupStack }) => {
      const personalizationClient = new PersonalizationClient(httpClient);
      const settingsClient = new SettingsClient(httpClient);
      await test.step("arrange: UpTree inheritance policy", () =>
        arrangeInheritancePolicy(settingsClient, cleanupStack, "UpTree"));

      const notification = await test.step("act: start outlines synchronization", () =>
        personalizationClient.synchronizeOutlines());

      await test.step("assert: synchronization finishes without errors", async () => {
        await expect
          .poll(async () => (await personalizationClient.findSynchronization(notification.id))?.finished, {
            timeout: SYNCHRONIZATION_TIMEOUT_MS,
          })
          .toEqual(expect.any(String));
        expect(await personalizationClient.findSynchronization(notification.id)).toMatchObject({
          errorCount: 0,
          errors: [],
        });
      });
    });
  });
});

async function arrangeInheritancePolicy(
  settingsClient: SettingsClient,
  cleanupStack: CleanupStack,
  policy: string,
): Promise<void> {
  const original = await registerSettingRestore(settingsClient, cleanupStack, INHERITANCE_POLICY_SETTING);
  await settingsClient.save([{ ...original, value: policy }]);
}

function productEntity(product: CatalogProduct): TaggedEntity {
  return { entityId: product.id, entityType: "Product", label: product.name };
}

function categoryEntity(category: Category): TaggedEntity {
  return { entityId: category.id, entityType: "Category", label: category.name };
}
