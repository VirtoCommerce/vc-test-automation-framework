import type { VirtoCommercePricingModuleCoreModelPricelist as Pricelist } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newPricelist } from "@builders/pricing.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

const PRICELISTS_PATH = "/api/pricing/pricelists";

test.describe("pricelists (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("create a pricelist", async ({ api, arrange, store }) => {
    const draft = newPricelist(store.defaultCurrency);
    arrange.pricing.deletePricelistLater(draft.id);

    const pricelist = await test.step("act: create a pricelist", async () =>
      (await api.post(PRICELISTS_PATH, { json: draft })).expectOk().json<Pricelist>());

    await test.step(`assert: the pricelist is in ${store.defaultCurrency}`, () => {
      expect(pricelist).toMatchObject({ name: draft.name, currency: store.defaultCurrency });
    });
  });

  test("get a pricelist by id", async ({ api, arrange }) => {
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());

    const reloaded = await test.step("act: get the pricelist", () => pricelistOf(api, pricelist.id));

    await test.step("assert: the fields match the created pricelist", () => {
      expect(reloaded).toMatchObject({ id: pricelist.id, name: pricelist.name });
    });
  });

  test("search pricelists by keyword", async ({ api, arrange }) => {
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());

    const found = await test.step("act: search pricelists by its name", () => searchPricelists(api, pricelist.name));

    await test.step("assert: the pricelist is found", () => {
      expect(found.map(({ id }) => id)).toContain(pricelist.id);
    });
  });

  test("rename a pricelist", async ({ api, arrange }) => {
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    const newName = `${pricelist.name}-renamed`;

    await test.step("act: rename the pricelist", async () =>
      (await api.put(PRICELISTS_PATH, { json: { ...pricelist, name: newName } })).expectOk());

    await test.step("assert: the pricelist has the new name", async () => {
      expect((await pricelistOf(api, pricelist.id))?.name).toBe(newName);
    });
  });

  test("delete a pricelist", async ({ api, arrange }) => {
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());

    await test.step("act: delete the pricelist", async () =>
      (await api.delete(PRICELISTS_PATH, { query: { ids: [pricelist.id] } })).expectOk());

    await test.step("assert: the pricelist is not found", async () => {
      expect(await pricelistOf(api, pricelist.id)).toBeUndefined();
      expect((await searchPricelists(api, pricelist.name)).map(({ id }) => id)).not.toContain(pricelist.id);
    });
  });
});

async function pricelistOf(api: HttpClient, id: string): Promise<Pricelist | undefined> {
  return (await api.get(`${PRICELISTS_PATH}/${id}`)).optionalJson<Pricelist>();
}

async function searchPricelists(api: HttpClient, keyword: string): Promise<Pricelist[]> {
  const response = await api.get(PRICELISTS_PATH, { query: { keyword } });
  return response.expectOk().json<{ results?: Pricelist[] | null }>().results ?? [];
}
