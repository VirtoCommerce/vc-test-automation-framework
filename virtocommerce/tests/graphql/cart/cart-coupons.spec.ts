import { expect, test } from "@fixtures";
import { AddCouponDocument, RemoveCouponDocument, ValidateCouponDocument } from "@graphql/generated/graphql.ts";
import { lineItemOf } from "@graphql/line-items.ts";
import { requireFields } from "@support/require-fields.ts";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const SALE_PRODUCT_ID = "product-qa-sale-001";
const SALE_QUANTITY = 2;
const PERCENTAGE_COUPON = "QA10OFF";
const PERCENTAGE = 10;
const FIXED_COUPON = "WELCOME20";
const FIXED_AMOUNT = 20;
const SWITCHED_FROM_COUPON = "COUPON-100-OFF";
const LOWERCASE_COUPON = "agenttestlc062";
const UNMET_CONDITION_COUPON = "QAMINSUB100K";
const VALIDATION_CASES = [
  { title: "a valid coupon", coupon: PERCENTAGE_COUPON, valid: true },
  { title: "an expired coupon", coupon: "QAEXPIRED", valid: false },
  { title: "an unknown coupon", coupon: "NO-SUCH-COUPON-QA-ZZZ", valid: false },
] as const;

test.describe("cart coupons (anonymous)", () => {
  for (const { title, coupon, valid } of VALIDATION_CASES) {
    test(`validate ${title}`, async ({ shopper, arrange }) => {
      const cart = await test.step("arrange: cart with a product", () =>
        arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 1 }]));

      const { validateCoupon } = await test.step(`act: validate ${coupon}`, async () =>
        shopper.graphql.execute(ValidateCouponDocument, { ...shopper.storeContext, cartId: cart.id, coupon }));

      await test.step(`assert: the coupon is ${valid ? "valid" : "not valid"}`, () => {
        expect(validateCoupon).toBe(valid);
      });
    });
  }

  test("a coupon applied after another one is the only coupon of the cart", async ({ shopper, arrange }) => {
    const cart = await test.step("arrange: cart with a product ×3", () =>
      arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 3 }]));
    const command = { ...shopper.storeContext, cartId: cart.id };
    await test.step(`arrange: ${SWITCHED_FROM_COUPON} applied, then removed`, async () => {
      await shopper.graphql.execute(AddCouponDocument, { command: { ...command, couponCode: SWITCHED_FROM_COUPON } });
      await shopper.graphql.execute(RemoveCouponDocument, {
        command: { ...command, couponCode: SWITCHED_FROM_COUPON },
      });
    });

    const { addCoupon } = await test.step(`act: apply ${PERCENTAGE_COUPON}`, () =>
      shopper.graphql.execute(AddCouponDocument, { command: { ...command, couponCode: PERCENTAGE_COUPON } }));

    await test.step(`assert: ${PERCENTAGE_COUPON} is the only, applied coupon and the totals add up`, () => {
      const switched = requireFields(addCoupon, ["coupons"], "Cart");
      expect(switched.coupons).toEqual([
        expect.objectContaining({ code: PERCENTAGE_COUPON, isAppliedSuccessfully: true }),
      ]);
      expect(switched.discountTotal.amount).toBeGreaterThan(0);
      expect(switched).toHaveConsistentTotals();
    });
  });

  test("a percentage coupon discounts the sale price, not the list price", async ({ shopper, arrange }) => {
    const cart = await test.step(`arrange: cart with the sale product ×${SALE_QUANTITY}`, () =>
      arrange.carts.cart(shopper, [{ productId: SALE_PRODUCT_ID, quantity: SALE_QUANTITY }]));
    const line = lineItemOf(cart, SALE_PRODUCT_ID);
    const salePrice = requireFields(line.salePrice, ["amount"], "Sale price").amount;
    const listPrice = requireFields(line.listPrice, ["amount"], "List price").amount;
    await test.step("arrange: the product is on sale", () => {
      expect(salePrice).toBeLessThan(listPrice);
    });

    const { addCoupon } = await test.step(`act: apply ${PERCENTAGE_COUPON}`, async () =>
      shopper.graphql.execute(AddCouponDocument, {
        command: { ...shopper.storeContext, cartId: cart.id, couponCode: PERCENTAGE_COUPON },
      }));

    await test.step(`assert: the discount is ${PERCENTAGE}% of the sale price and the totals add up`, () => {
      const discounted = requireFields(addCoupon, ["coupons"], "Cart");
      const couponDiscount = discounted.discountTotal.amount - cart.discountTotal.amount;
      expect(discounted.coupons).toEqual([
        expect.objectContaining({ code: PERCENTAGE_COUPON, isAppliedSuccessfully: true }),
      ]);
      expect(couponDiscount).toBeCloseTo((salePrice * SALE_QUANTITY * PERCENTAGE) / 100, 1);
      expect(couponDiscount).toBeLessThan((listPrice * SALE_QUANTITY * PERCENTAGE) / 100);
      expect(discounted).toHaveConsistentTotals();
    });
  });

  test("a fixed-amount coupon takes its amount off the cart", async ({ shopper, arrange }) => {
    const cart = await test.step("arrange: cart with a product ×3", () =>
      arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 3 }]));
    await test.step(`arrange: the subtotal is above ${FIXED_AMOUNT}`, () => {
      expect(cart.subTotal.amount).toBeGreaterThan(FIXED_AMOUNT);
    });

    const { addCoupon } = await test.step(`act: apply ${FIXED_COUPON}`, async () =>
      shopper.graphql.execute(AddCouponDocument, {
        command: { ...shopper.storeContext, cartId: cart.id, couponCode: FIXED_COUPON },
      }));

    await test.step(`assert: the discount grows by ${FIXED_AMOUNT} and the totals add up`, () => {
      const discounted = requireFields(addCoupon, ["coupons"], "Cart");
      expect(discounted.coupons).toEqual([
        expect.objectContaining({ code: FIXED_COUPON, isAppliedSuccessfully: true }),
      ]);
      expect(discounted.discountTotal.amount - cart.discountTotal.amount).toBeCloseTo(FIXED_AMOUNT, 2);
      expect(discounted).toHaveConsistentTotals();
    });
  });

  test("a coupon whose condition is not met is recorded but not applied", async ({ shopper, arrange }) => {
    const cart = await test.step("arrange: cart with a product", () =>
      arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 1 }]));

    const { addCoupon } = await test.step(`act: apply ${UNMET_CONDITION_COUPON}`, async () =>
      shopper.graphql.execute(AddCouponDocument, {
        command: { ...shopper.storeContext, cartId: cart.id, couponCode: UNMET_CONDITION_COUPON },
      }));

    await test.step("assert: the coupon is not applied, nothing is discounted and the totals add up", () => {
      const recorded = requireFields(addCoupon, ["coupons"], "Cart");
      expect(recorded.coupons).toEqual([
        expect.objectContaining({ code: UNMET_CONDITION_COUPON, isAppliedSuccessfully: false }),
      ]);
      expect(recorded.discountTotal.amount).toBe(cart.discountTotal.amount);
      expect(recorded).toHaveConsistentTotals();
    });
  });

  test("a lowercase coupon keeps its case and matches in any case", async ({ shopper, arrange }) => {
    const cart = await test.step("arrange: cart with a product ×3", () =>
      arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 3 }]));
    const command = { ...shopper.storeContext, cartId: cart.id };

    const asStored = await test.step(`act: apply ${LOWERCASE_COUPON}`, () =>
      shopper.graphql.execute(AddCouponDocument, { command: { ...command, couponCode: LOWERCASE_COUPON } }));
    await test.step("assert: the coupon is applied with its stored, lowercase code", () => {
      expect(asStored.addCoupon?.coupons).toEqual([
        expect.objectContaining({ code: LOWERCASE_COUPON, isAppliedSuccessfully: true }),
      ]);
    });

    const upperCase = await test.step(`act: replace it with ${LOWERCASE_COUPON.toUpperCase()}`, async () => {
      await shopper.graphql.execute(RemoveCouponDocument, { command: { ...command, couponCode: LOWERCASE_COUPON } });
      return shopper.graphql.execute(AddCouponDocument, {
        command: { ...command, couponCode: LOWERCASE_COUPON.toUpperCase() },
      });
    });
    await test.step("assert: the upper-case code is applied too", () => {
      expect(upperCase.addCoupon?.coupons).toEqual([
        expect.objectContaining({
          code: expect.stringMatching(new RegExp(`^${LOWERCASE_COUPON}$`, "i")),
          isAppliedSuccessfully: true,
        }),
      ]);
    });
  });
});
