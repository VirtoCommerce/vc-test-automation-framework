import * as allure from "allure-js-commons";

import { newPricelist } from "@dataset/builders/pricing";
import { expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Pricing / Pricelists");
});

test.describe("pricelists (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("create a pricelist", async ({ api, cleanup, store }) => {
    await allure.story("Create");
    await allure.description("A new pricelist has its name and the store's currency.");
    const draft = newPricelist(store.defaultCurrency);
    cleanup.push(`delete pricelist ${draft.name}`, () => api.rest.pricing.pricelists.delete([draft.id]));

    const pricelist = await test.step("act: create a pricelist", () => api.rest.pricing.pricelists.create(draft));

    await test.step(`assert: the pricelist is in ${store.defaultCurrency}`, () => {
      expect(pricelist).toMatchObject({ name: draft.name, currency: store.defaultCurrency });
    });
  });

  test("get a pricelist by id", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("A pricelist is read back by its id.");
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());

    const reloaded = await test.step("act: get the pricelist", () => api.rest.pricing.pricelists.get(pricelist.id));

    await test.step("assert: the fields match the created pricelist", () => {
      expect(reloaded).toMatchObject({ id: pricelist.id, name: pricelist.name });
    });
  });

  test("search pricelists by keyword", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description("Searching pricelists by a pricelist's name finds it.");
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());

    const found = await test.step("act: search pricelists by its name", () =>
      api.rest.pricing.pricelists.search({ keyword: pricelist.name }));

    await test.step("assert: the pricelist is found", () => {
      expect(found.map(({ id }) => id)).toContain(pricelist.id);
    });
  });

  test("rename a pricelist", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("A renamed pricelist is read back with its new name.");
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    const newName = `${pricelist.name}-renamed`;

    await test.step("act: rename the pricelist", () =>
      api.rest.pricing.pricelists.update({ ...pricelist, name: newName }));

    await test.step("assert: the pricelist has the new name", async () => {
      expect((await api.rest.pricing.pricelists.get(pricelist.id)).name).toBe(newName);
    });
  });

  test("delete a pricelist", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A deleted pricelist is neither read nor found by search.");
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());

    await test.step("act: delete the pricelist", () => api.rest.pricing.pricelists.delete([pricelist.id]));

    await test.step("assert: the pricelist is not found", async () => {
      expect(await api.rest.pricing.pricelists.find(pricelist.id)).toBeUndefined();
      expect((await api.rest.pricing.pricelists.search({ keyword: pricelist.name })).map(({ id }) => id)).not.toContain(
        pricelist.id,
      );
    });
  });
});
