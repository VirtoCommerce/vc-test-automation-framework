import { expect, test } from "@fixtures";
import { MODULES } from "@modules";

const CART = [{ productId: "product-smartphone-apple-iphone-17-256gb-black", quantity: 2 }];
const CODE_COUPON = "agenttestlc062";
const PERCENTAGE_PRESET = "QA10OFF";
const FIXED_PRESET = "WELCOME20";
const REJECTED_CODES = [
  { title: "an unknown code", code: "NOPE-INVALID-123" },
  { title: "an expired code", code: "QAEXPIRED" },
] as const;
const NOT_EMPTY = /\S/;

test.describe("cart coupons of an anonymous visitor", () => {
  test.beforeEach(({ arrange, shopper }) => arrange.carts.checkoutReadyCart(shopper, CART));

  test("enter a coupon code", async ({ frontend }) => {
    const cart = frontend.cart();
    await cart.navigate();
    await expect(cart.couponSection.customCodeInput).toBeVisible();
    const before = await cart.totalAmount();

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

test.describe("cart coupon codes of a customer", () => {
  test.use({ shopperAs: "customer" });
  test.beforeEach(({ arrange, shopper }) => arrange.carts.checkoutReadyCart(shopper, CART));

  test("remove a coupon entered as a code", async ({ frontend }) => {
    const cart = frontend.cart();
    await cart.navigate();
    await expect(cart.couponSection.customCodeInput).toBeVisible();
    const before = await cart.totalAmount();
    await cart.couponSection.applyCode(CODE_COUPON);
    await expect(cart.couponSection.removeButton).toBeVisible();

    await test.step("act: remove the coupon", () => cart.couponSection.remove());

    await test.step("assert: the code field is back and the total is restored", async () => {
      await expect(cart.couponSection.removeButton).toBeHidden();
      await expect(cart.couponSection.applyButton).toBeVisible();
      await expect.poll(() => cart.totalAmount()).toBe(before);
    });
  });

  for (const { title, code } of REJECTED_CODES) {
    test(`${title} is rejected without a discount`, async ({ frontend }) => {
      const cart = frontend.cart();
      await cart.navigate();
      await expect(cart.couponSection.customCodeInput).toBeVisible();
      const before = await cart.totalAmount();

      await test.step(`act: apply ${code}`, () => cart.couponSection.enterCode(code));

      await test.step("assert: the code is not valid and the total is unchanged", async () => {
        await expect(cart.couponSection.errorMessage).toContainText(/not valid/i);
        expect(await cart.totalAmount()).toBe(before);
      });
    });
  }
});

test.describe("cart preset coupons of a customer", () => {
  test.use({ modules: { xMarketing: MODULES.xMarketing }, shopperAs: "customer" });
  test.beforeEach(({ arrange, shopper }) => arrange.carts.checkoutReadyCart(shopper, CART));

  test("preset coupons show their label and promotion name", async ({ frontend }) => {
    const cart = frontend.cart();

    await test.step("act: open the cart", () => cart.navigate());

    await test.step("assert: the first preset card has a label and a name", async () => {
      const { label, name } = cart.couponSection.presetParts(cart.couponSection.presetCards.first());
      await expect(cart.couponSection.presetCards.first()).toBeVisible();
      await expect(label).toHaveText(NOT_EMPTY);
      await expect(name).toHaveText(NOT_EMPTY);
    });
  });

  test("apply a preset coupon, then switch to another", async ({ frontend }) => {
    const cart = frontend.cart();
    await cart.navigate();
    await expect(cart.couponSection.presetCards.first()).toBeVisible();
    const before = await cart.totalAmount();

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

  test("remove an applied preset coupon", async ({ frontend }) => {
    const cart = frontend.cart();
    await cart.navigate();
    await expect(cart.couponSection.presetCards.first()).toBeVisible();
    const before = await cart.totalAmount();
    await cart.couponSection.applyPreset(PERCENTAGE_PRESET);
    await expect(cart.couponSection.appliedCards).toHaveCount(1);

    await test.step("act: remove the coupon", () => cart.couponSection.remove());

    await test.step("assert: no coupon is applied and the total is restored", async () => {
      await expect(cart.couponSection.appliedCards).toHaveCount(0);
      await expect.poll(() => cart.totalAmount()).toBe(before);
    });
  });

  test("the view-all link opens the account coupons page", async ({ frontend, context }) => {
    const cart = frontend.cart();
    await cart.navigate();
    await expect(cart.couponSection.viewAllLink).toBeVisible();

    const opened = await test.step("act: click the view-all link", async () => {
      const [page] = await Promise.all([context.waitForEvent("page"), cart.couponSection.viewAllLink.click()]);
      return page;
    });

    await test.step("assert: the account coupons page opens", async () => {
      await expect(opened).toHaveURL(/\/account\/coupons$/);
    });
  });
});
