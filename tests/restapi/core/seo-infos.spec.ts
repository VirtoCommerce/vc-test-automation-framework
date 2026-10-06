import * as allure from "allure-js-commons";

import { SeoInfosClient } from "@api/rest/clients/seo-infos-client";
import { SEEDED_CATALOG_ID } from "@dataset/seeded";
import { asWorkerAdministrator, expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.feature("Core / SEO");
});

test.describe("seo infos (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  test("find no SEO duplicates in the seeded catalog", async ({ httpClient }) => {
    const seoInfosClient = new SeoInfosClient(httpClient);

    const duplicates = await test.step("act: find SEO duplicates", () =>
      seoInfosClient.findDuplicates("Catalog", SEEDED_CATALOG_ID));

    await test.step("assert: there are no duplicates", async () => {
      expect(duplicates).toEqual([]);
    });
  });
});
