import * as allure from "allure-js-commons";

import { uniqueId } from "@core/unique-id";
import { newCategory } from "@dataset/builders/catalog";
import { expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Catalog / Categories");
});

test.describe("categories (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("create a category", async ({ api, arrange }) => {
    await allure.story("Create");
    await allure.description("A new category belongs to its catalog, with its name and code.");
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const draft = newCategory(catalog.id);

    const category = await test.step("act: create a category", () => api.rest.catalog.categories.save(draft));

    await test.step("assert: the category belongs to the catalog", () => {
      expect(category).toMatchObject({ name: draft.name, code: draft.code, catalogId: catalog.id });
    });
  });

  test("create a nested category", async ({ api, arrange }) => {
    await allure.story("Create");
    await allure.description("A category created under another one is its child, in the same catalog.");
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const parent = await test.step("arrange: a parent category", () => arrange.catalog.category(catalog.id));

    const child = await test.step("act: create a category under the parent", () =>
      api.rest.catalog.categories.save({ ...newCategory(catalog.id), parentId: parent.id }));

    await test.step("assert: the stored child is under the parent in the same catalog", async () => {
      expect(await api.rest.catalog.categories.get(child.id)).toMatchObject({
        parentId: parent.id,
        catalogId: parent.catalogId,
      });
    });
  });

  test("get a new category template", async ({ api, arrange }) => {
    await allure.story("Template");
    await allure.description("The template of a new category describes its SEO as a category's.");
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());

    const template = await test.step("act: get a new category template", () =>
      api.rest.catalog.categories.template(catalog.id));

    await test.step("assert: the template has the Category SEO object type", () => {
      expect(template.seoObjectType).toBe("Category");
    });
  });

  test("get a category by id", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("A category is read back by its id with the fields it was created with.");
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const category = await test.step("arrange: a category", () => arrange.catalog.category(catalog.id));

    const reloaded = await test.step("act: get the category", () => api.rest.catalog.categories.get(category.id));

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
    await allure.story("Read");
    await allure.description("Reading a category that does not exist answers 404.");

    await test.step("assert: getting a category by an unknown id answers 404", async () => {
      await expect(api.rest.catalog.categories.get(uniqueId("test-missing-category"))).rejects.toBeHttpError(404);
    });
  });

  test("rename a category", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("A renamed category is read back with its new name.");
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const category = await test.step("arrange: a category", () => arrange.catalog.category(catalog.id));
    const newName = `${category.name}-renamed`;

    await test.step("act: rename the category", () => api.rest.catalog.categories.save({ ...category, name: newName }));

    await test.step("assert: the category has the new name", async () => {
      expect((await api.rest.catalog.categories.get(category.id)).name).toBe(newName);
    });
  });

  test("delete a category", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A category deleted as a list entry can no longer be read.");
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const category = await test.step("arrange: a category", () => arrange.catalog.category(catalog.id));

    await test.step("act: delete the category", () => api.rest.catalog.listEntries.delete([category.id]));

    await test.step("assert: the category is not found", async () => {
      await expect(api.rest.catalog.categories.get(category.id)).rejects.toBeHttpError(404);
    });
  });
});
