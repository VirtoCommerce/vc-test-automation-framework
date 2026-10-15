import * as allure from "allure-js-commons";

import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const ITEMS = [{ productId: PRODUCT_ID, quantity: 2 }] as const;
const CODE_COUPON = "agenttestlc062";
const PERCENTAGE_PRESET = "QA10OFF";
const FIXED_PRESET = "WELCOME20";
const REJECTED_CODES = [
  { title: "an unknown code", code: "NOPE-INVALID-123" },
  { title: "an expired code", code: "QAEXPIRED" },
] as const;
const NOT_EMPTY = /\S/;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Cart coupons");
});

test.describe("cart coupons (anonymous)", () => {
  test("enter a coupon code as an anonymous visitor", async ({ frontend, shopper, arrange }) => {
    await allure.story("Coupon code");
    await allure.description(
      `An anonymous visitor sees only the code field, no preset coupons; ${CODE_COUPON} entered there lowers the total.`,
    );
    await test.step("arrange: a cart ready for checkout", () => arrange.carts.checkoutReadyCart(shopper.api, ITEMS));
    const cart = frontend.cart();
    const before = await test.step("arrange: open the cart", async () => {
      await cart.navigate();
      await expect(cart.couponSection.customCodeInput).toBeVisible();
      return cart.totalAmount();
    });

    await test.step("assert: only the code field is offered", async () => {
      await expect(cart.couponSection.presetCards).toHaveCount(0);
      await expect(cart.couponSection.viewAllLink).toHaveCount(0);
    });

    await test.step(`act: apply ${CODE_COUPON}`, () => cart.couponSection.applyCode(CODE_COUPON));

    await test.step("assert: the coupon is applied and the total is lower", async () => {
      await expect(cart.couponSection.removeButton).toBeVisible();
      await expect.poll(() => cart.totalAmount()).toBeLessThan(before);
    });
  });
});

test.describe("cart coupon codes (customer of their own)", () => {
  test.use({ shopperKind: "customer" });

  test("remove a coupon entered as a code", async ({ frontend, shopper, arrange }) => {
    await allure.story("Coupon code");
    await allure.description(`Removing ${CODE_COUPON} brings back the code field and the original total.`);
    await test.step("arrange: a cart ready for checkout", () => arrange.carts.checkoutReadyCart(shopper.api, ITEMS));
    const cart = frontend.cart();
    const before = await test.step(`arrange: the cart with ${CODE_COUPON} applied`, async () => {
      await cart.navigate();
      await expect(cart.couponSection.customCodeInput).toBeVisible();
      const total = await cart.totalAmount();
      await cart.couponSection.applyCode(CODE_COUPON);
      await expect(cart.couponSection.removeButton).toBeVisible();
      return total;
    });

    await test.step("act: remove the coupon", () => cart.couponSection.remove());

    await test.step("assert: the code field is back and the total is restored", async () => {
      await expect(cart.couponSection.removeButton).toBeHidden();
      await expect(cart.couponSection.applyButton).toBeVisible();
      await expect.poll(() => cart.totalAmount()).toBe(before);
    });
  });

  for (const { title, code } of REJECTED_CODES) {
    test(`${title} is rejected without a discount`, async ({ frontend, shopper, arrange }) => {
      await allure.story("Coupon code");
      await allure.description(`${title}, ${code}, shows "not valid" and leaves the total as it was.`);
      await test.step("arrange: a cart ready for checkout", () => arrange.carts.checkoutReadyCart(shopper.api, ITEMS));
      const cart = frontend.cart();
      const before = await test.step("arrange: open the cart", async () => {
        await cart.navigate();
        await expect(cart.couponSection.customCodeInput).toBeVisible();
        return cart.totalAmount();
      });

      await test.step(`act: apply ${code}`, () => cart.couponSection.enterCode(code));

      await test.step("assert: the code is not valid and the total is unchanged", async () => {
        await expect(cart.couponSection.errorMessage).toContainText(/not valid/i);
        expect(await cart.totalAmount()).toBe(before);
      });
    });
  }
});

test.describe("cart preset coupons (customer of their own)", () => {
  test.use({ shopperKind: "customer", requiresModules: [MODULES.xMarketing] });

  test("preset coupons show their label and promotion name", async ({ frontend, shopper, arrange }) => {
    await allure.story("Preset coupons");
    await allure.description("A signed-in customer sees preset coupon cards, each with a label and a promotion name.");
    await test.step("arrange: a cart ready for checkout", () => arrange.carts.checkoutReadyCart(shopper.api, ITEMS));
    const cart = frontend.cart();

    await test.step("act: open the cart", () => cart.navigate());

    await test.step("assert: the first preset card has a label and a name", async () => {
      const { label, name } = cart.couponSection.presetParts(cart.couponSection.presetCards.first());
      await expect(cart.couponSection.presetCards.first()).toBeVisible();
      await expect(label).toHaveText(NOT_EMPTY);
      await expect(name).toHaveText(NOT_EMPTY);
    });
  });

  test("apply a preset coupon, then switch to another", async ({ frontend, shopper, arrange }) => {
    await allure.story("Preset coupons");
    await allure.description(
      `Clicking ${PERCENTAGE_PRESET} applies it and lowers the total; clicking ${FIXED_PRESET} then replaces it.`,
    );
    await test.step("arrange: a cart ready for checkout", () => arrange.carts.checkoutReadyCart(shopper.api, ITEMS));
    const cart = frontend.cart();
    const before = await test.step("arrange: open the cart", async () => {
      await cart.navigate();
      await expect(cart.couponSection.presetCards.first()).toBeVisible();
      return cart.totalAmount();
    });

    await test.step(`act: click ${PERCENTAGE_PRESET}`, () => cart.couponSection.applyPreset(PERCENTAGE_PRESET));
    await test.step(`assert: ${PERCENTAGE_PRESET} is the applied coupon and the total is lower`, async () => {
      await expect(cart.couponSection.appliedCards).toHaveCount(1);
      await expect(cart.couponSection.appliedCode).toHaveValue(PERCENTAGE_PRESET);
      await expect.poll(() => cart.totalAmount()).toBeLessThan(before);
    });

    await test.step(`act: click ${FIXED_PRESET}`, () => cart.couponSection.applyPreset(FIXED_PRESET));
    await test.step(`assert: ${FIXED_PRESET} is now the only applied coupon`, async () => {
      await expect(cart.couponSection.appliedCards).toHaveCount(1);
      await expect(cart.couponSection.appliedCode).toHaveValue(FIXED_PRESET);
    });
  });

  test("remove an applied preset coupon", async ({ frontend, shopper, arrange }) => {
    await allure.story("Preset coupons");
    await allure.description(
      `Removing the applied ${PERCENTAGE_PRESET} leaves no coupon applied and restores the total.`,
    );
    await test.step("arrange: a cart ready for checkout", () => arrange.carts.checkoutReadyCart(shopper.api, ITEMS));
    const cart = frontend.cart();
    const before = await test.step(`arrange: the cart with ${PERCENTAGE_PRESET} applied`, async () => {
      await cart.navigate();
      await expect(cart.couponSection.presetCards.first()).toBeVisible();
      const total = await cart.totalAmount();
      await cart.couponSection.applyPreset(PERCENTAGE_PRESET);
      await expect(cart.couponSection.appliedCards).toHaveCount(1);
      return total;
    });

    await test.step("act: remove the coupon", () => cart.couponSection.remove());

    await test.step("assert: no coupon is applied and the total is restored", async () => {
      await expect(cart.couponSection.appliedCards).toHaveCount(0);
      await expect.poll(() => cart.totalAmount()).toBe(before);
    });
  });

  test("the view-all link opens the account coupons page", async ({ frontend, shopper, arrange, context }) => {
    await allure.story("Preset coupons");
    await allure.description("The coupon section links to the account coupons page, which opens in a new tab.");
    await test.step("arrange: a cart ready for checkout", () => arrange.carts.checkoutReadyCart(shopper.api, ITEMS));
    const cart = frontend.cart();
    await test.step("arrange: open the cart", async () => {
      await cart.navigate();
      await expect(cart.couponSection.viewAllLink).toBeVisible();
    });

    const opened = await test.step("act: click the view-all link", async () => {
      const [page] = await Promise.all([context.waitForEvent("page"), cart.couponSection.viewAllLink.click()]);
      return page;
    });

    await test.step("assert: the account coupons page opens", async () => {
      await expect(opened).toHaveURL(/\/account\/coupons$/);
    });
  });
});
