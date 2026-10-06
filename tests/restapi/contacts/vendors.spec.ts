import * as allure from "allure-js-commons";

import { CustomersClient } from "@api/rest/clients/customers-client";
import { newMember } from "@dataset/builders/customer";
import { asWorkerAdministrator, expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.feature("Contacts / Vendors");
});

test.describe("vendors (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  test("search vendors", async ({ httpClient, cleanupStack }) => {
    const customersClient = new CustomersClient(httpClient);
    const vendor = await test.step("arrange: vendor", () => customersClient.members.create(newMember("Vendor")));
    cleanupStack.push(`delete vendor ${vendor.id}`, () => customersClient.members.delete([vendor.id]));

    const found = await test.step("act: search vendors by id", () =>
      customersClient.searchVendors({ objectIds: [vendor.id] }));

    await test.step("assert: vendor is found", async () => {
      expect(found).toEqual([expect.objectContaining({ id: vendor.id, memberType: "Vendor" })]);
    });
  });
});
