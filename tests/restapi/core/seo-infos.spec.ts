import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Core / SEO");
});

test.describe("SEO infos (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("the store's catalog has no SEO duplicates", async ({ api, store }) => {
    await allure.story("Duplicates");
    await allure.description("No two objects of the store's catalog share an SEO slug.");

    const duplicates = await test.step(`act: find the SEO duplicates of ${store.catalog}`, () =>
      api.rest.seoInfos.findDuplicates("Catalog", store.catalog));

    await test.step("assert: there are none", () => {
      expect(duplicates).toEqual([]);
    });
  });
});
