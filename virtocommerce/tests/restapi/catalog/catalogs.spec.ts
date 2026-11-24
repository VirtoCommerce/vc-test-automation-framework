import type {
  VirtoCommerceCatalogModuleCoreModelCatalog as Catalog,
  VirtoCommerceCatalogModuleCoreModelSearchCatalogSearchResult as CatalogSearchResult,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newCatalog } from "@builders/catalog.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

const CATALOGS_PATH = "/api/catalog/catalogs";
const CATALOG_KINDS = [
  { kind: "physical", isVirtual: false },
  { kind: "virtual", isVirtual: true },
] as const;

test.describe("catalogs (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  for (const { kind, isVirtual } of CATALOG_KINDS) {
    test(`create a ${kind} catalog`, async ({ api, arrange, store }) => {
      const draft = { ...newCatalog(store.defaultLanguage), isVirtual };
      arrange.catalog.deleteCatalogLater(draft.id);

      const catalog = await test.step(`act: create a ${kind} catalog`, async () =>
        (await api.post(CATALOGS_PATH, { json: draft })).expectOk().json<Catalog>());

      await test.step(`assert: the catalog is ${kind} with ${store.defaultLanguage} as its default language`, () => {
        expect(catalog).toMatchObject({ name: draft.name, isVirtual });
        expect(catalog.languages).toContainEqual(
          expect.objectContaining({ languageCode: store.defaultLanguage, isDefault: true }),
        );
      });
      await test.step(`assert: search finds the catalog as ${kind}`, async () => {
        const found = await searchCatalogs(api, { keyword: draft.name });
        expect(found.find(({ id }) => id === draft.id)).toMatchObject({ isVirtual });
      });
    });
  }

  test("rename a catalog", async ({ api, arrange }) => {
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());
    const newName = `${catalog.name}-renamed`;

    await test.step("act: rename the catalog", async () =>
      (await api.put(CATALOGS_PATH, { json: { ...catalog, name: newName } })).expectOk());

    await test.step("assert: search by the new name finds the catalog", async () => {
      const found = await searchCatalogs(api, { keyword: newName });
      expect(found.map(({ id }) => id)).toContain(catalog.id);
    });
  });

  test("delete a catalog", async ({ api, arrange }) => {
    const catalog = await test.step("arrange: a catalog", () => arrange.catalog.catalog());

    await test.step("act: delete the catalog", async () =>
      (await api.delete(`${CATALOGS_PATH}/${catalog.id}`)).expectOk());

    await test.step("assert: search by its id or its name finds nothing", async () => {
      expect(await searchCatalogs(api, { objectIds: [catalog.id] })).toEqual([]);
      expect(await searchCatalogs(api, { keyword: catalog.name })).toEqual([]);
    });
  });
});

async function searchCatalogs(api: HttpClient, criteria: Record<string, unknown>): Promise<Catalog[]> {
  const response = await api.post(`${CATALOGS_PATH}/search`, { json: criteria });
  return response.expectOk().json<CatalogSearchResult>().results ?? [];
}
