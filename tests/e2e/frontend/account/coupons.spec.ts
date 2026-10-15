import * as allure from "allure-js-commons";

import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";

const NOT_EMPTY = /\S/;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Account coupons");
});

test.describe("account coupons (customer of their own)", () => {
  test.use({
    shopperKind: "customer",
    requiresModules: [MODULES.xMarketing],
    permissions: ["clipboard-read", "clipboard-write"],
  });

  test("list the store's coupons", async ({ frontend }) => {
    await allure.story("Coupon list");
    await allure.description("The account coupons page shows the store's coupons as cards with their codes.");
    const coupons = frontend.coupons();

    await test.step("act: open the account coupons page", () => coupons.navigate());

    await test.step("assert: coupon cards with codes are shown", async () => {
      await expect(coupons.cards.first()).toBeVisible();
      await expect(coupons.card(0).code).toHaveText(NOT_EMPTY);
    });
  });

  test("copy a coupon code", async ({ frontend }) => {
    await allure.story("Copy code");
    await allure.description("Clicking a coupon's code copies exactly that code to the clipboard.");
    const coupons = frontend.coupons();
    const card = coupons.card(0);
    const code = await test.step("arrange: the first coupon's code", async () => {
      await coupons.navigate();
      await expect(card.code).toHaveText(NOT_EMPTY);
      return (await card.code.innerText()).trim();
    });

    await test.step("act: click the code", () => card.codeButton.click());

    await test.step(`assert: the clipboard holds ${code}`, async () => {
      await expect.poll(async () => (await coupons.clipboardText()).trim()).toBe(code);
    });
  });
});
