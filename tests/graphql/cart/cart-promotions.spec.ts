import * as allure from "allure-js-commons";

import { AddCouponDocument, RemoveCouponDocument } from "@api/graphql/generated/graphql";
import { requireFields } from "@core/required-fields";
import { arrangeCart, cartScope, lineItemFor } from "@dataset/arrange/cart";
import { SEEDED_PRODUCTS } from "@dataset/seeded";
import { expect, test } from "@fixtures";

const COUPON_PRODUCT_ID = SEEDED_PRODUCTS.iphone17Black;
const COUPON_CODE = "COUPON-100-OFF";
const COUPON_DISCOUNT = 100;
const ITEM_DISCOUNT_PRODUCT_ID = SEEDED_PRODUCTS.galaxyA57;
const ITEM_DISCOUNT = 50;
const SUBTOTAL_DISCOUNT_PRODUCT_ID = "smartphone-samsung-galaxy-s26-black";
const SUBTOTAL_DISCOUNT_QUANTITY = 5;
const SUBTOTAL_DISCOUNT_PER_ITEM = 100;
const GIFT_PRODUCT_ID = "smartphone-samsung-galaxy-a17-5g-black";
const GIFT_THRESHOLD_QUANTITY = 20;

test.beforeEach(async () => {
  await allure.feature("Cart / Promotions");
});

test.describe("cart promotions (anonymous)", () => {
  test("add and remove a coupon", async ({ graphqlClient, cleanupStack, frontendContext }) => {
    const cart = await test.step("arrange: cart with a product", () =>
      arrangeCart(graphqlClient, cleanupStack, frontendContext, [{ productId: COUPON_PRODUCT_ID, quantity: 3 }]));
    const command = { ...cartScope(frontendContext), cartId: cart.id, couponCode: COUPON_CODE };

    const { addCoupon } = await test.step(`act: add coupon ${COUPON_CODE}`, () =>
      graphqlClient.execute(AddCouponDocument, { command }));
    await test.step(`assert: coupon is applied and takes ${COUPON_DISCOUNT} off the total`, async () => {
      expect(addCoupon?.coupons).toEqual([expect.objectContaining({ code: COUPON_CODE, isAppliedSuccessfully: true })]);
      expect(addCoupon?.total?.amount).toBeCloseTo(totalOf(cart) - COUPON_DISCOUNT, 2);
    });

    const { removeCoupon } = await test.step(`act: remove coupon ${COUPON_CODE}`, () =>
      graphqlClient.execute(RemoveCouponDocument, { command }));
    await test.step("assert: cart has no coupons and its total is restored", async () => {
      expect(removeCoupon?.coupons).toEqual([]);
      expect(removeCoupon?.total?.amount).toBeCloseTo(totalOf(cart), 2);
    });
  });

  test("apply an item discount to a discounted product", async ({ graphqlClient, cleanupStack, frontendContext }) => {
    const cart = await test.step("act: add the discounted product", () =>
      arrangeCart(graphqlClient, cleanupStack, frontendContext, [
        { productId: ITEM_DISCOUNT_PRODUCT_ID, quantity: 1 },
      ]));

    await test.step(`assert: line item is ${ITEM_DISCOUNT} off its list price`, async () => {
      const line = lineItemFor(cart, ITEM_DISCOUNT_PRODUCT_ID);
      expect(line.discountAmount?.amount).toBe(ITEM_DISCOUNT);
      expect(line.placedPrice?.amount).toBeCloseTo(
        requireFields(line.listPrice, ["amount"], "List price").amount - ITEM_DISCOUNT,
        2,
      );
    });
  });

  test("apply a subtotal discount above the threshold", async ({ graphqlClient, cleanupStack, frontendContext }) => {
    const cart = await test.step(`act: add ${SUBTOTAL_DISCOUNT_QUANTITY} products that reach the threshold`, () =>
      arrangeCart(graphqlClient, cleanupStack, frontendContext, [
        { productId: SUBTOTAL_DISCOUNT_PRODUCT_ID, quantity: SUBTOTAL_DISCOUNT_QUANTITY },
      ]));

    await test.step(`assert: every product is ${SUBTOTAL_DISCOUNT_PER_ITEM} off`, async () => {
      expect(lineItemFor(cart, SUBTOTAL_DISCOUNT_PRODUCT_ID).discountAmount?.amount).toBe(SUBTOTAL_DISCOUNT_PER_ITEM);
      expect(cart.subTotalDiscount?.amount).toBe(SUBTOTAL_DISCOUNT_PER_ITEM * SUBTOTAL_DISCOUNT_QUANTITY);
    });
  });

  test("grant a gift above the quantity threshold", async ({ graphqlClient, cleanupStack, frontendContext }) => {
    const cart = await test.step(`act: add ${GIFT_THRESHOLD_QUANTITY} products`, () =>
      arrangeCart(graphqlClient, cleanupStack, frontendContext, [
        { productId: GIFT_PRODUCT_ID, quantity: GIFT_THRESHOLD_QUANTITY },
      ]));

    await test.step("assert: cart has one gift of the promoted product", async () => {
      expect(cart.gifts).toEqual([expect.objectContaining({ productId: GIFT_PRODUCT_ID, quantity: 1 })]);
    });
  });
});

function totalOf(cart: { readonly total?: { readonly amount?: number } | null }): number {
  return requireFields(cart.total, ["amount"], "Cart total").amount;
}
