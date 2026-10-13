import { expect, test } from "@playwright/test";

import { HttpClient } from "@api/http/http-client";
import { RestApi } from "@api/rest/rest-api";

test.describe("bulk delete guards", () => {
  test("deleting assignments by filter refuses an empty keyword", async ({ request }) => {
    const restApi = new RestApi(new HttpClient(request), "store-acme");

    await expect(
      restApi.pricing.assignments.deleteMatching({ keyword: " ", priceListId: "pricelist" }),
    ).rejects.toThrow("needs a non-empty keyword");
  });

  test("deleting members by criteria refuses an empty id list", async ({ request }) => {
    const restApi = new RestApi(new HttpClient(request), "store-acme");

    await expect(restApi.customers.deleteMatchingMembers({ objectIds: [] })).rejects.toThrow(
      "needs at least one id in objectIds",
    );
  });
});
