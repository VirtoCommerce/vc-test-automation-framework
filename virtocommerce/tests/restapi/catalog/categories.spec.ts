import type { VirtoCommerceCatalogModuleCoreModelCategory as Category } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newCategory } from "@builders/catalog.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { uniqueId } from "@support/unique-id.ts";

const CATEGORIES_PATH = "/api/catalog/categories";

test.describe("categories (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("create a category", async ({ api, arrange }) => {
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const draft = newCategory(catalog.id);

    const category = await test.step("act: create a category", async () =>
      (await api.post(CATEGORIES_PATH, { json: draft })).expectOk().json<Category>());

    await test.step("assert: the category belongs to the catalog", () => {
      expect(category).toMatchObject({ name: draft.name, code: draft.code, catalogId: catalog.id });
    });
  });

  test("create a nested category", async ({ api, arrange }) => {
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const parent = await test.step("arrange: a parent category", () => arrange.catalog.category(catalog.id));

    const child = await test.step("act: create a category under the parent", async () =>
      (await api.post(CATEGORIES_PATH, { json: { ...newCategory(catalog.id), parentId: parent.id } }))
        .expectOk()
        .json<Category>());

    await test.step("assert: the stored child is under the parent in the same catalog", async () => {
      expect(await categoryOf(api, String(child.id))).toMatchObject({
        parentId: parent.id,
        catalogId: parent.catalogId,
      });
    });
  });

  test("get a new category template", async ({ api, arrange }) => {
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());

    const template = await test.step("act: get a new category template", async () =>
      (await api.get(`/api/catalog/${catalog.id}/categories/newcategory`)).expectOk().json<Category>());

    await test.step("assert: the template has the Category SEO object type", () => {
      expect(template.seoObjectType).toBe("Category");
    });
  });

  test("get a category by id", async ({ api, arrange }) => {
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const category = await test.step("arrange: a category", () => arrange.catalog.category(catalog.id));

    const reloaded = await test.step("act: get the category", () => categoryOf(api, category.id));

    await test.step("assert: the fields match the created category", () => {
      expect(reloaded).toMatchObject({
        id: category.id,
        name: category.name,
        code: category.code,
        catalogId: category.catalogId,
      });
    });
  });

  test("get a missing category", async ({ api }) => {
    const response = await test.step("act: get a category by an unknown id", () =>
      api.get(`${CATEGORIES_PATH}/${uniqueId("test-missing-category")}`));

    await test.step("assert: the platform answers 404", () => {
      expect(response.status).toBe(404);
    });
  });

  test("rename a category", async ({ api, arrange }) => {
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const category = await test.step("arrange: a category", () => arrange.catalog.category(catalog.id));
    const newName = `${category.name}-renamed`;

    await test.step("act: rename the category", async () =>
      (await api.post(CATEGORIES_PATH, { json: { ...category, name: newName } })).expectOk());

    await test.step("assert: the category has the new name", async () => {
      expect((await categoryOf(api, category.id)).name).toBe(newName);
    });
  });

  test("delete a category", async ({ api, arrange }) => {
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const category = await test.step("arrange: a category", () => arrange.catalog.category(catalog.id));

    await test.step("act: delete the category", async () =>
      (await api.post("/api/catalog/listentries/delete", { json: { objectIds: [category.id] } })).expectOk());

    await test.step("assert: the category is not found", async () => {
      expect((await api.get(`${CATEGORIES_PATH}/${category.id}`)).status).toBe(404);
    });
  });
});

async function categoryOf(api: HttpClient, id: string): Promise<Category> {
  return (await api.get(`${CATEGORIES_PATH}/${id}`)).expectOk().json<Category>();
}
