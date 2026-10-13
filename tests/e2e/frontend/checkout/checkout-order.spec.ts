import * as allure from "allure-js-commons";

import { requireFields } from "@core/required-fields";
import { TEST_ADDRESS } from "@dataset/builders/address";
import { expect, test } from "@fixtures";

const ITEMS = [{ productId: "product-smartphone-google-pixel-10-lemongrass", quantity: 3 }] as const;
const FIXED_RATE_GROUND = "FixedRate_Ground";
const MANUAL_PAYMENT_METHOD = "DefaultManualPaymentMethod";
const ORDER_NUMBER_ATTRIBUTE = "data-order-number";

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Checkout");
});

test.describe("checkout order (anonymous)", () => {
  test("place an order", async ({ frontend, shopper, arrange }) => {
    await allure.story("Order");
    await allure.description(
      "An order placed through the checkout, shipped and paid manually, is the shopper's one order, and the " +
        "completed page shows its number.",
    );
    const { userId } = await shopper.api.storeContext();
    await test.step("arrange: a cart", () => arrange.carts.defaultCart(shopper.api, ITEMS));
    arrange.orders.deleteOrdersOfLater(userId);
    const flow = frontend.checkout();
    const { shippingDetails, paymentDetails } = flow;

    await test.step(`arrange: ship and pay on the ${flow.mode} checkout`, async () => {
      await flow.start();
      await shippingDetails.shippingSwitcher.click();
      await shippingDetails.shippingAddressButton.click();
      await frontend.editAddressModal.submit(TEST_ADDRESS);
      await expect(shippingDetails.shippingAddressLabel).toContainText(TEST_ADDRESS.line1);
      await shippingDetails.selectShippingMethod(FIXED_RATE_GROUND);
      await expect(shippingDetails.selectedShippingMethod(FIXED_RATE_GROUND)).toBeVisible();
      await flow.continueToPayment();
      await paymentDetails.selectPaymentMethod(MANUAL_PAYMENT_METHOD);
      await expect(paymentDetails.selectedPaymentMethod(MANUAL_PAYMENT_METHOD)).toBeVisible();
    });

    await test.step("act: place the order", () => flow.placeOrder());

    await test.step("assert: the completed page shows the number of the shopper's one order", async () => {
      await expect(flow.completedPage.orderNumberLabel).toHaveAttribute(ORDER_NUMBER_ATTRIBUTE, /\S/);
      const orders = await arrange.admin.rest.orders.search({ customerIds: [userId] });
      expect(orders).toHaveLength(1);
      const { number } = requireFields(orders[0], ["number"], "Placed order");
      await expect(flow.completedPage.orderNumberLabel).toHaveAttribute(ORDER_NUMBER_ATTRIBUTE, number);
    });
  });
});
