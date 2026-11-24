import { expect, test } from "@fixtures";
import { AddCouponDocument, RemoveCouponDocument } from "@graphql/generated/graphql.ts";
import { lineItemOf } from "@graphql/line-items.ts";
import { requireFields } from "@support/require-fields.ts";

const COUPON_PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const COUPON_CODE = "COUPON-100-OFF";
const COUPON_DISCOUNT = 100;
const ITEM_DISCOUNT_PRODUCT_ID = "product-smartphone-samsung-galaxy-a57-5g";
const ITEM_DISCOUNT = 50;
const SUBTOTAL_DISCOUNT_PRODUCT_ID = "product-smartphone-samsung-galaxy-s26-black";
const SUBTOTAL_DISCOUNT_QUANTITY = 5;
const SUBTOTAL_DISCOUNT_PER_ITEM = 100;
const GIFT_PRODUCT_ID = "product-smartphone-samsung-galaxy-a17-5g-black";
const GIFT_THRESHOLD_QUANTITY = 20;

test.describe("cart promotions (anonymous)", () => {
  test("add and remove a coupon", async ({ shopper, arrange }) => {
    const cart = await test.step("arrange: cart with a product ×3", () =>
      arrange.carts.cart(shopper, [{ productId: COUPON_PRODUCT_ID, quantity: 3 }]));
    const total = requireFields(cart.total, ["amount"], "Cart total").amount;
    const command = { ...shopper.storeContext, cartId: cart.id, couponCode: COUPON_CODE };

    const { addCoupon } = await test.step(`act: add coupon ${COUPON_CODE}`, () =>
      shopper.graphql.execute(AddCouponDocument, { command }));
    await test.step(`assert: the coupon is applied and takes ${COUPON_DISCOUNT} off the total`, () => {
      expect(addCoupon?.coupons).toEqual([expect.objectContaining({ code: COUPON_CODE, isAppliedSuccessfully: true })]);
      expect(addCoupon?.total?.amount).toBeCloseTo(total - COUPON_DISCOUNT, 2);
    });

    const { removeCoupon } = await test.step(`act: remove coupon ${COUPON_CODE}`, () =>
      shopper.graphql.execute(RemoveCouponDocument, { command }));
    await test.step("assert: the cart has no coupon and its total is restored", () => {
      expect(removeCoupon?.coupons).toEqual([]);
      expect(removeCoupon?.total?.amount).toBeCloseTo(total, 2);
    });
  });

  test("apply an item discount to a discounted product", async ({ shopper, arrange }) => {
    const cart = await test.step("act: add the discounted product", () =>
      arrange.carts.cart(shopper, [{ productId: ITEM_DISCOUNT_PRODUCT_ID, quantity: 1 }]));

    await test.step(`assert: the line item is ${ITEM_DISCOUNT} off its list price`, () => {
      const line = lineItemOf(cart, ITEM_DISCOUNT_PRODUCT_ID);
      expect(line.discountAmount?.amount).toBe(ITEM_DISCOUNT);
      expect(line.placedPrice?.amount).toBeCloseTo(
        requireFields(line.listPrice, ["amount"], "List price").amount - ITEM_DISCOUNT,
        2,
      );
    });
  });

  test("apply a subtotal discount above the threshold", async ({ shopper, arrange }) => {
    const cart = await test.step(`act: add ${SUBTOTAL_DISCOUNT_QUANTITY} products that reach the threshold`, () =>
      arrange.carts.cart(shopper, [{ productId: SUBTOTAL_DISCOUNT_PRODUCT_ID, quantity: SUBTOTAL_DISCOUNT_QUANTITY }]));

    await test.step(`assert: every product is ${SUBTOTAL_DISCOUNT_PER_ITEM} off`, () => {
      expect(lineItemOf(cart, SUBTOTAL_DISCOUNT_PRODUCT_ID).discountAmount?.amount).toBe(SUBTOTAL_DISCOUNT_PER_ITEM);
      expect(cart.subTotalDiscount?.amount).toBe(SUBTOTAL_DISCOUNT_PER_ITEM * SUBTOTAL_DISCOUNT_QUANTITY);
    });
  });

  test("grant a gift above the quantity threshold", async ({ shopper, arrange }) => {
    const cart = await test.step(`act: add ${GIFT_THRESHOLD_QUANTITY} products`, () =>
      arrange.carts.cart(shopper, [{ productId: GIFT_PRODUCT_ID, quantity: GIFT_THRESHOLD_QUANTITY }]));

    await test.step("assert: the cart has one gift of the promoted product", () => {
      expect(cart.gifts).toEqual([expect.objectContaining({ productId: GIFT_PRODUCT_ID, quantity: 1 })]);
    });
  });
});
