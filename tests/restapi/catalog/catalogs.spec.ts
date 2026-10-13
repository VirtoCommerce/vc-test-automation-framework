import * as allure from "allure-js-commons";

import { newCatalog } from "@dataset/builders/catalog";
import { expect, test } from "@fixtures";

const CATALOG_KINDS = [
  { kind: "physical", isVirtual: false },
  { kind: "virtual", isVirtual: true },
] as const;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Catalog / Catalogs");
});

test.describe("catalogs (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  for (const { kind, isVirtual } of CATALOG_KINDS) {
    test(`create a ${kind} catalog`, async ({ api, cleanup, store }) => {
      await allure.story("Create");
      await allure.description(`A new ${kind} catalog keeps its kind and its default language, also in search.`);
      const draft = { ...newCatalog(store.defaultLanguage), isVirtual };
      cleanup.push(`delete catalog ${draft.name}`, () => api.rest.catalog.catalogs.delete(draft.id));

      const catalog = await test.step(`act: create a ${kind} catalog`, () => api.rest.catalog.catalogs.create(draft));

      await test.step(`assert: the catalog is ${kind} with ${store.defaultLanguage} as its default language`, () => {
        expect(catalog).toMatchObject({ name: draft.name, isVirtual });
        expect(catalog.languages).toContainEqual(
          expect.objectContaining({ languageCode: store.defaultLanguage, isDefault: true }),
        );
      });
      await test.step(`assert: search finds the catalog as ${kind}`, async () => {
        const found = await api.rest.catalog.catalogs.search({ keyword: catalog.name });
        expect(found.find(({ id }) => id === catalog.id)).toMatchObject({ isVirtual });
      });
    });
  }

  test("rename a catalog", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("A renamed catalog is found by its new name.");
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const newName = `${catalog.name}-renamed`;

    await test.step("act: rename the catalog", () => api.rest.catalog.catalogs.update({ ...catalog, name: newName }));

    await test.step("assert: search by the new name finds the catalog", async () => {
      const found = await api.rest.catalog.catalogs.search({ keyword: newName });
      expect(found.map(({ id }) => id)).toContain(catalog.id);
    });
  });

  test("delete a catalog", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A deleted catalog is found neither by its id nor by its name.");
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());

    await test.step("act: delete the catalog", () => api.rest.catalog.catalogs.delete(catalog.id));

    await test.step("assert: search by its id or its name finds nothing", async () => {
      expect(await api.rest.catalog.catalogs.search({ objectIds: [catalog.id] })).toEqual([]);
      expect(await api.rest.catalog.catalogs.search({ keyword: catalog.name })).toEqual([]);
    });
  });
});
