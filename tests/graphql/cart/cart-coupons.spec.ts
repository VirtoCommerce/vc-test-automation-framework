import * as allure from "allure-js-commons";

import { AddCouponDocument, RemoveCouponDocument, ValidateCouponDocument } from "@api/graphql/generated/graphql";
import { lineItemOf } from "@api/graphql/line-items";
import { requireFields } from "@core/required-fields";
import { expect, test } from "@fixtures";

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

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Cart / Coupons");
});

test.describe("cart coupons (anonymous)", () => {
  for (const { title, coupon, valid } of VALIDATION_CASES) {
    test(`validate ${title}`, async ({ api, arrange }) => {
      await allure.story("Validation");
      await allure.description(`validateCoupon answers ${valid} for ${title}, ${coupon}.`);
      const cart = await test.step("arrange: cart with a product", () =>
        arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 1 }]));

      const { validateCoupon } = await test.step(`act: validate ${coupon}`, async () =>
        api.graphql.execute(ValidateCouponDocument, { ...(await api.storeContext()), cartId: cart.id, coupon }));

      await test.step(`assert: the coupon is ${valid ? "valid" : "not valid"}`, () => {
        expect(validateCoupon).toBe(valid);
      });
    });
  }

  test("a coupon applied after another one is the only coupon of the cart", async ({ api, arrange }) => {
    await allure.story("Switching coupons");
    await allure.description(
      `After ${SWITCHED_FROM_COUPON} is removed, ${PERCENTAGE_COUPON} is the cart's only coupon.`,
    );
    const cart = await test.step("arrange: cart with a product ×3", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 3 }]));
    const command = { ...(await api.storeContext()), cartId: cart.id };
    await test.step(`arrange: ${SWITCHED_FROM_COUPON} applied, then removed`, async () => {
      await api.graphql.execute(AddCouponDocument, { command: { ...command, couponCode: SWITCHED_FROM_COUPON } });
      await api.graphql.execute(RemoveCouponDocument, { command: { ...command, couponCode: SWITCHED_FROM_COUPON } });
    });

    const { addCoupon } = await test.step(`act: apply ${PERCENTAGE_COUPON}`, () =>
      api.graphql.execute(AddCouponDocument, { command: { ...command, couponCode: PERCENTAGE_COUPON } }));

    await test.step(`assert: ${PERCENTAGE_COUPON} is the only, applied coupon and the totals add up`, () => {
      const switched = requireFields(addCoupon, ["coupons"], "Cart");
      expect(switched.coupons).toEqual([
        expect.objectContaining({ code: PERCENTAGE_COUPON, isAppliedSuccessfully: true }),
      ]);
      expect(switched.discountTotal.amount).toBeGreaterThan(0);
      expect(switched.total.amount).toBeCloseTo(
        switched.subTotal.amount -
          switched.discountTotal.amount +
          switched.taxTotal.amount +
          switched.shippingTotal.amount,
        2,
      );
    });
  });

  test("a percentage coupon discounts the sale price, not the list price", async ({ api, arrange }) => {
    await allure.story("Discounts");
    await allure.description(
      `${PERCENTAGE_COUPON} takes ${PERCENTAGE}% of the sale price of a product on sale, not of its list price.`,
    );
    const cart = await test.step(`arrange: cart with the sale product ×${SALE_QUANTITY}`, () =>
      arrange.carts.cart(api, [{ productId: SALE_PRODUCT_ID, quantity: SALE_QUANTITY }]));
    const line = lineItemOf(cart, SALE_PRODUCT_ID);
    const salePrice = requireFields(line.salePrice, ["amount"], "Sale price").amount;
    const listPrice = requireFields(line.listPrice, ["amount"], "List price").amount;
    await test.step("arrange: the product is on sale", () => {
      expect(salePrice).toBeLessThan(listPrice);
    });

    const { addCoupon } = await test.step(`act: apply ${PERCENTAGE_COUPON}`, async () =>
      api.graphql.execute(AddCouponDocument, {
        command: { ...(await api.storeContext()), cartId: cart.id, couponCode: PERCENTAGE_COUPON },
      }));

    await test.step(`assert: the discount is ${PERCENTAGE}% of the sale price and the totals add up`, () => {
      const discounted = requireFields(addCoupon, ["coupons"], "Cart");
      const couponDiscount = discounted.discountTotal.amount - cart.discountTotal.amount;
      expect(discounted.coupons).toEqual([
        expect.objectContaining({ code: PERCENTAGE_COUPON, isAppliedSuccessfully: true }),
      ]);
      expect(couponDiscount).toBeCloseTo((salePrice * SALE_QUANTITY * PERCENTAGE) / 100, 1);
      expect(couponDiscount).toBeLessThan((listPrice * SALE_QUANTITY * PERCENTAGE) / 100);
      expect(discounted.total.amount).toBeCloseTo(
        discounted.subTotal.amount -
          discounted.discountTotal.amount +
          discounted.taxTotal.amount +
          discounted.shippingTotal.amount,
        2,
      );
    });
  });

  test("a fixed-amount coupon takes its amount off the cart", async ({ api, arrange }) => {
    await allure.story("Discounts");
    await allure.description(`${FIXED_COUPON} takes ${FIXED_AMOUNT} off a cart whose subtotal is above it.`);
    const cart = await test.step("arrange: cart with a product ×3", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 3 }]));
    await test.step(`arrange: the subtotal is above ${FIXED_AMOUNT}`, () => {
      expect(cart.subTotal.amount).toBeGreaterThan(FIXED_AMOUNT);
    });

    const { addCoupon } = await test.step(`act: apply ${FIXED_COUPON}`, async () =>
      api.graphql.execute(AddCouponDocument, {
        command: { ...(await api.storeContext()), cartId: cart.id, couponCode: FIXED_COUPON },
      }));

    await test.step(`assert: the discount grows by ${FIXED_AMOUNT} and the totals add up`, () => {
      const discounted = requireFields(addCoupon, ["coupons"], "Cart");
      expect(discounted.coupons).toEqual([
        expect.objectContaining({ code: FIXED_COUPON, isAppliedSuccessfully: true }),
      ]);
      expect(discounted.discountTotal.amount - cart.discountTotal.amount).toBeCloseTo(FIXED_AMOUNT, 2);
      expect(discounted.total.amount).toBeCloseTo(
        discounted.subTotal.amount -
          discounted.discountTotal.amount +
          discounted.taxTotal.amount +
          discounted.shippingTotal.amount,
        2,
      );
    });
  });

  test("a coupon whose condition is not met is recorded but not applied", async ({ api, arrange }) => {
    await allure.story("Conditions");
    await allure.description(
      `${UNMET_CONDITION_COUPON} needs a subtotal of 100,000; on a small cart it is listed as not applied and ` +
        "discounts nothing.",
    );
    const cart = await test.step("arrange: cart with a product", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 1 }]));

    const { addCoupon } = await test.step(`act: apply ${UNMET_CONDITION_COUPON}`, async () =>
      api.graphql.execute(AddCouponDocument, {
        command: { ...(await api.storeContext()), cartId: cart.id, couponCode: UNMET_CONDITION_COUPON },
      }));

    await test.step("assert: the coupon is not applied, nothing is discounted and the totals add up", () => {
      const recorded = requireFields(addCoupon, ["coupons"], "Cart");
      expect(recorded.coupons).toEqual([
        expect.objectContaining({ code: UNMET_CONDITION_COUPON, isAppliedSuccessfully: false }),
      ]);
      expect(recorded.discountTotal.amount).toBe(cart.discountTotal.amount);
      expect(recorded.total.amount).toBeCloseTo(
        recorded.subTotal.amount -
          recorded.discountTotal.amount +
          recorded.taxTotal.amount +
          recorded.shippingTotal.amount,
        2,
      );
    });
  });

  test("a lowercase coupon keeps its case and matches in any case", async ({ api, arrange }) => {
    await allure.story("Coupon codes");
    await allure.link("https://virtocommerce.atlassian.net/browse/VCST-5233", "VCST-5233");
    await allure.description(
      `${LOWERCASE_COUPON} is stored in lowercase: applied as is it keeps its case, and its upper-case form ` +
        "matches it too.",
    );
    const cart = await test.step("arrange: cart with a product ×3", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 3 }]));
    const command = { ...(await api.storeContext()), cartId: cart.id };

    const asStored = await test.step(`act: apply ${LOWERCASE_COUPON}`, () =>
      api.graphql.execute(AddCouponDocument, { command: { ...command, couponCode: LOWERCASE_COUPON } }));
    await test.step("assert: the coupon is applied with its stored, lowercase code", () => {
      expect(asStored.addCoupon?.coupons).toEqual([
        expect.objectContaining({ code: LOWERCASE_COUPON, isAppliedSuccessfully: true }),
      ]);
    });

    const upperCase = await test.step(`act: replace it with ${LOWERCASE_COUPON.toUpperCase()}`, async () => {
      await api.graphql.execute(RemoveCouponDocument, { command: { ...command, couponCode: LOWERCASE_COUPON } });
      return api.graphql.execute(AddCouponDocument, {
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
