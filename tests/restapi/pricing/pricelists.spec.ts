import * as allure from "allure-js-commons";

import { PricingClient } from "@api/rest/clients/pricing-client";
import { newPricelist } from "@dataset/builders/pricing";
import { SEEDED_CURRENCY } from "@dataset/seeded";
import { asWorkerAdministrator, expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.feature("Pricing / Pricelists");
});

test.describe("pricelists (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  test("create a pricelist", async ({ httpClient, cleanupStack }) => {
    const pricingClient = new PricingClient(httpClient);
    const draft = newPricelist();

    const pricelist = await test.step("act: create pricelist", () => pricingClient.createPricelist(draft));
    cleanupStack.push(`delete pricelist ${pricelist.id}`, () => pricingClient.deletePricelist(pricelist.id));

    await test.step("assert: pricelist has the currency", async () => {
      expect(pricelist).toMatchObject({ name: draft.name, currency: SEEDED_CURRENCY });
    });
  });

  test("rename a pricelist", async ({ httpClient, cleanupStack }) => {
    const pricingClient = new PricingClient(httpClient);
    const pricelist = await test.step("arrange: pricelist", () => pricingClient.createPricelist(newPricelist()));
    cleanupStack.push(`delete pricelist ${pricelist.id}`, () => pricingClient.deletePricelist(pricelist.id));
    const newName = `${pricelist.name}-renamed`;

    await test.step("act: rename pricelist", () => pricingClient.updatePricelist({ ...pricelist, name: newName }));

    await test.step("assert: pricelist has the new name", async () => {
      expect((await pricingClient.getPricelist(pricelist.id)).name).toBe(newName);
    });
  });

  test("search pricelists by keyword", async ({ httpClient, cleanupStack }) => {
    const pricingClient = new PricingClient(httpClient);
    const pricelist = await test.step("arrange: pricelist", () => pricingClient.createPricelist(newPricelist()));
    cleanupStack.push(`delete pricelist ${pricelist.id}`, () => pricingClient.deletePricelist(pricelist.id));

    const found = await test.step("act: search by pricelist name", () =>
      pricingClient.searchPricelists({ Keyword: pricelist.name }));

    await test.step("assert: pricelist is in the results", async () => {
      expect(found.map(({ id }) => id)).toContain(pricelist.id);
    });
  });

  test("get a pricelist by id", async ({ httpClient, cleanupStack }) => {
    const pricingClient = new PricingClient(httpClient);
    const pricelist = await test.step("arrange: pricelist", () => pricingClient.createPricelist(newPricelist()));
    cleanupStack.push(`delete pricelist ${pricelist.id}`, () => pricingClient.deletePricelist(pricelist.id));

    const reloaded = await test.step("act: get pricelist", () => pricingClient.getPricelist(pricelist.id));

    await test.step("assert: fields match the created pricelist", async () => {
      expect(reloaded).toMatchObject({ id: pricelist.id, name: pricelist.name });
    });
  });

  test("list pricelists", async ({ httpClient, cleanupStack }) => {
    const pricingClient = new PricingClient(httpClient);
    const pricelist = await test.step("arrange: pricelist", () => pricingClient.createPricelist(newPricelist()));
    cleanupStack.push(`delete pricelist ${pricelist.id}`, () => pricingClient.deletePricelist(pricelist.id));

    const pricelists = await test.step("act: list pricelists", () => pricingClient.searchPricelists({ Take: 1000 }));

    await test.step("assert: pricelist is listed", async () => {
      expect(pricelists.map(({ id }) => id)).toContain(pricelist.id);
    });
  });

  test("delete a pricelist", async ({ httpClient, cleanupStack }) => {
    const pricingClient = new PricingClient(httpClient);
    const pricelist = await test.step("arrange: pricelist", () => pricingClient.createPricelist(newPricelist()));
    cleanupStack.push(`delete pricelist ${pricelist.id}`, () => pricingClient.deletePricelist(pricelist.id));

    await test.step("act: delete pricelist", () => pricingClient.deletePricelist(pricelist.id));

    await test.step("assert: pricelist is not found", async () => {
      expect(await pricingClient.findPricelist(pricelist.id)).toBeUndefined();
      expect((await pricingClient.searchPricelists({ Keyword: pricelist.name })).map(({ id }) => id)).not.toContain(
        pricelist.id,
      );
    });
  });
});
