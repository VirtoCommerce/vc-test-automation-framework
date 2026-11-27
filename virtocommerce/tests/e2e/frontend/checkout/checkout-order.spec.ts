import type { VirtoCommerceOrdersModuleCoreModelSearchCustomerOrderSearchResult as CustomerOrderSearchResult } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { TEST_ADDRESS } from "@builders/address.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { requireFields } from "@support/require-fields.ts";

const ITEMS = [{ productId: "product-smartphone-google-pixel-10-lemongrass", quantity: 3 }] as const;
const FIXED_RATE_GROUND = "FixedRate_Ground";
const MANUAL_PAYMENT_METHOD = "DefaultManualPaymentMethod";
const ORDER_NUMBER_ATTRIBUTE = "data-order-number";

test.describe("checkout order (anonymous)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("place an order", async ({ api, frontend, shopper, arrange }) => {
    const { userId } = shopper.storeContext;
    await test.step("arrange: a cart", () => arrange.carts.cart(shopper, ITEMS));
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
      const orders = await ordersOf(api, userId);
      expect(orders).toHaveLength(1);
      const { number } = requireFields(orders[0], ["number"], "Placed order");
      await expect(flow.completedPage.orderNumberLabel).toHaveAttribute(ORDER_NUMBER_ATTRIBUTE, number);
    });
  });
});

async function ordersOf(
  api: HttpClient,
  customerId: string,
): Promise<NonNullable<CustomerOrderSearchResult["results"]>> {
  const response = await api.post("/api/order/customerOrders/search", { json: { customerIds: [customerId] } });
  return response.expectOk().json<CustomerOrderSearchResult>().results ?? [];
}
