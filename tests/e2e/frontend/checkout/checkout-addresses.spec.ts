import type { Frontend } from "@pages/frontend/frontend";
import type { CheckoutFlow } from "@pages/frontend/pages/cart-pages";

import * as allure from "allure-js-commons";

import { requireFields } from "@core/required-fields";
import { newMemberAddress, TEST_ADDRESS } from "@dataset/builders/address";
import { expect, test } from "@fixtures";

const ITEMS = [{ productId: "product-smartphone-google-pixel-10-lemongrass", quantity: 3 }] as const;
const FIXED_RATE_GROUND = "FixedRate_Ground";
const SAVED_ADDRESS = {
  line1: "742 Evergreen Terrace",
  city: "Morrisville",
  regionId: "NC",
  regionName: "North Carolina",
  countryCode: "USA",
  countryName: "United States of America",
  postalCode: "27560",
} as const;
const SAVED_ADDRESS_FILTER = {
  country: SAVED_ADDRESS.countryName,
  region: SAVED_ADDRESS.regionName,
  city: SAVED_ADDRESS.city,
} as const;
const SAVED_ADDRESS_LISTS = [
  {
    list: "shipping",
    story: "Shipping address",
    open: async (flow: CheckoutFlow) => {
      await flow.start();
      await flow.shippingDetails.shippingSwitcher.click();
      await flow.shippingDetails.shippingAddressButton.click();
    },
  },
  {
    list: "billing",
    story: "Billing address",
    open: async (flow: CheckoutFlow, frontend: Frontend) => {
      await flow.start();
      await flow.shippingDetails.shippingSwitcher.click();
      await flow.shippingDetails.shippingAddressButton.click();
      await frontend.selectAddressModal.pick(SAVED_ADDRESS.line1);
      await flow.shippingDetails.selectShippingMethod(FIXED_RATE_GROUND);
      await flow.continueToPayment();
      await flow.paymentDetails.useSeparateBillingAddress();
      await flow.paymentDetails.selectAddressButton.click();
    },
  },
] as const;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Checkout");
});

test.describe("checkout addresses (anonymous)", () => {
  test("add a new shipping address", async ({ frontend, shopper, arrange }) => {
    await allure.story("Shipping address");
    await allure.description("A new address entered at checkout becomes the shipping address.");
    await test.step("arrange: a cart", () => arrange.carts.defaultCart(shopper.api, ITEMS));
    const flow = frontend.checkout();
    const modal = frontend.editAddressModal;

    await test.step(`arrange: open the ${flow.mode} checkout with shipping`, async () => {
      await flow.start();
      await flow.shippingDetails.shippingSwitcher.click();
    });

    await test.step(`act: enter ${TEST_ADDRESS.line1}`, async () => {
      await flow.shippingDetails.shippingAddressButton.click();
      await modal.submit(TEST_ADDRESS);
    });

    await test.step("assert: the new address is the shipping address", async () => {
      await expect(modal.root).toBeHidden();
      await expect(flow.shippingDetails.shippingAddressLabel).toContainText(TEST_ADDRESS.line1);
    });
  });

  test("the billing address mirrors the shipping address", async ({ frontend, shopper, arrange }) => {
    await allure.story("Billing address");
    await allure.description("Unless told otherwise, the billing address is the shipping address.");
    await test.step("arrange: a cart", () => arrange.carts.defaultCart(shopper.api, ITEMS));
    const flow = frontend.checkout();

    await test.step(`arrange: ship to ${TEST_ADDRESS.line1} on the ${flow.mode} checkout`, async () => {
      await flow.start();
      await flow.shippingDetails.shippingSwitcher.click();
      await flow.shippingDetails.shippingAddressButton.click();
      await frontend.editAddressModal.submit(TEST_ADDRESS);
      await expect(flow.shippingDetails.shippingAddressLabel).toContainText(TEST_ADDRESS.line1);
      await flow.shippingDetails.selectShippingMethod(FIXED_RATE_GROUND);
    });

    await test.step("act: continue to the payment details", () => flow.continueToPayment());

    await test.step("assert: billing is the same as shipping", async () => {
      await expect(flow.paymentDetails.billingEqualsShippingCheckbox).toBeVisible();
      await expect(flow.paymentDetails.selectedAddressLabel).toContainText(TEST_ADDRESS.line1);
    });
  });
});

test.describe("checkout addresses (customer of their own with an organization address)", () => {
  test.use({ shopperKind: "customer" });

  test.beforeEach(async ({ shopper, arrange }) => {
    const { organizationId } = requireFields(shopper.account, ["organizationId"], "Customer");
    await test.step(`arrange: the organization's address ${SAVED_ADDRESS.line1}, ${SAVED_ADDRESS.city}`, () =>
      arrange.customers.memberAddress(
        shopper.api,
        organizationId,
        newMemberAddress("test-org-address", SAVED_ADDRESS),
      ));
    await test.step("arrange: a cart", () => arrange.carts.defaultCart(shopper.api, ITEMS));
  });

  test("pick a saved shipping address", async ({ frontend }) => {
    await allure.story("Shipping address");
    await allure.description("A saved organization address picked at checkout becomes the shipping address.");
    const flow = frontend.checkout();
    const modal = frontend.selectAddressModal;

    await test.step(`arrange: open the saved addresses on the ${flow.mode} checkout`, async () => {
      await flow.start();
      await flow.shippingDetails.shippingSwitcher.click();
      await flow.shippingDetails.shippingAddressButton.click();
    });

    await test.step(`act: pick ${SAVED_ADDRESS.line1}`, () => modal.pick(SAVED_ADDRESS.line1));

    await test.step("assert: the saved address is the shipping address", async () => {
      await expect(flow.shippingDetails.shippingAddressLabel).toContainText(SAVED_ADDRESS.line1);
    });
  });

  for (const { list, story, open } of SAVED_ADDRESS_LISTS) {
    test(`filter saved ${list} addresses by country, region and city`, async ({ frontend }) => {
      await allure.story(story);
      await allure.description(
        `The saved ${list} addresses filtered by the saved address's country, region and city still list it.`,
      );
      const flow = frontend.checkout();
      const modal = frontend.selectAddressModal;

      await test.step(`arrange: open the saved ${list} addresses on the ${flow.mode} checkout`, async () => {
        await open(flow, frontend);
        await expect(modal.root).toBeVisible();
      });

      await test.step(`act: filter by ${Object.values(SAVED_ADDRESS_FILTER).join(", ")}`, () =>
        modal.filters.apply(SAVED_ADDRESS_FILTER));

      await test.step(`assert: ${SAVED_ADDRESS.line1} is listed`, async () => {
        await expect(modal.address(SAVED_ADDRESS.line1)).toBeVisible();
      });
    });
  }
});
