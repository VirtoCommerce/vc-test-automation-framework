import { customerOf } from "@arrange";
import { newMemberAddress, TEST_ADDRESS } from "@builders/address.ts";
import { expect, test } from "@fixtures";

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

test.describe("top header (anonymous)", () => {
  for (const { name, value, label, selector } of HEADER_SELECTORS) {
    test(`switch the ${name}`, async ({ frontend }) => {
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
  test.use({ shopperAs: "customer" });

  test("pick a saved address from the ship-to selector", async ({ frontend, shopper, arrange }) => {
    const { organizationId } = customerOf(shopper);
    const draft = newMemberAddress("test-ship-to");
    await test.step(`arrange: the organization's address ${draft.line1}`, () =>
      arrange.customers.memberAddress(shopper, organizationId, draft));
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
