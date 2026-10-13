import * as allure from "allure-js-commons";

import { requireFields } from "@core/required-fields";
import { newMemberAddress, TEST_ADDRESS } from "@dataset/builders/address";
import { KNOWN_ISSUES } from "@dataset/known-issues";
import { expect, knownIssue, test } from "@fixtures";

const HEADER_SELECTORS = [
  { name: "currency", value: "EUR", label: "EUR", selector: "currencySelector" },
  { name: "language", value: "de-DE", label: "de", selector: "languageSelector" },
] as const;
const SHIP_TO_PARTS = [
  TEST_ADDRESS.city,
  TEST_ADDRESS.countryName,
  TEST_ADDRESS.regionName,
  TEST_ADDRESS.postalCode,
  TEST_ADDRESS.line1,
] as const;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Header");
});

test.describe("top header (anonymous)", () => {
  for (const { name, value, label, selector } of HEADER_SELECTORS) {
    test(`switch the ${name}`, async ({ frontend }) => {
      await allure.story("Store settings");
      await allure.description(`Selecting ${value} in the header makes it the current ${name}.`);
      const home = frontend.home();
      const headerSelector = home.topHeader[selector];
      await test.step("arrange: open the home page", () => home.navigate());

      await test.step(`act: select ${value}`, () => headerSelector.select(value));

      await test.step(`assert: the current ${name} is ${label}`, async () => {
        await expect(headerSelector.currentLabel).toHaveText(label);
      });
    });
  }

  test("add a shipping address from the ship-to selector", async ({ frontend }) => {
    await allure.story("Ship-to address");
    await allure.description("An address added from the header becomes the ship-to address with all its parts.");
    const home = frontend.home();
    const { topHeader } = home;
    await test.step("arrange: open the home page", () => home.navigate());

    await test.step(`act: add ${TEST_ADDRESS.line1}`, async () => {
      await topHeader.addShippingAddressButton.click();
      await frontend.editAddressModal.submit(TEST_ADDRESS);
    });

    await test.step("assert: the ship-to selector shows the new address", async () => {
      await expect(topHeader.addShippingAddressButton).toBeHidden();
      for (const part of SHIP_TO_PARTS) {
        await expect(topHeader.shipToSelector.selectedAddressLabel).toContainText(part);
      }
    });
  });
});

test.describe("top header (customer of their own)", () => {
  test.use({ shopperKind: "customer" });

  test("pick a saved address from the ship-to selector", async ({ frontend, shopper, arrange }) => {
    await knownIssue(KNOWN_ISSUES.shipToLabelNotRefreshed);
    await allure.story("Ship-to address");
    await allure.description("A saved organization address picked in the header becomes the ship-to address.");
    const { organizationId } = requireFields(shopper.account, ["organizationId"], "Customer");
    const draft = newMemberAddress("test-ship-to");
    await test.step(`arrange: the organization's address ${draft.line1}`, () =>
      arrange.customers.memberAddress(shopper.api, organizationId, draft));
    const home = frontend.home();
    const { shipToSelector } = home.topHeader;

    await test.step("arrange: open the ship-to selector", async () => {
      await home.navigate();
      await shipToSelector.root.click();
      await expect(shipToSelector.addressesList).toBeVisible();
    });

    await test.step(`act: pick ${draft.line1}`, () => shipToSelector.address({ line1: draft.line1 }).click());

    await test.step("assert: the saved address is the ship-to address", async () => {
      await expect(shipToSelector.selectedAddressLabel).toContainText(draft.line1);
    });
  });
});
