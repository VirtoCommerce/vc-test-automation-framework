import type { VirtoCommerceSeoCoreModelsSeoInfo as SeoInfo } from "@rest/generated/platform.ts";

import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

test.describe("SEO infos (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("the store's catalog has no SEO duplicates", async ({ api, store }) => {
    const duplicates = await test.step(`act: find the SEO duplicates of ${store.catalog}`, async () =>
      (await api.get("/api/seoinfos/duplicates", { query: { objectType: "Catalog", objectId: store.catalog } }))
        .expectOk()
        .json<SeoInfo[]>());

    await test.step("assert: there are none", () => {
      expect(duplicates).toEqual([]);
    });
  });
});
