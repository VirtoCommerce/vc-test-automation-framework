import { expect, test } from "@fixtures";
import { MODULES } from "@modules";

const NOT_EMPTY = /\S/;

test.describe("account coupons (customer of their own)", () => {
  test.use({
    shopperAs: "customer",
    modules: { xMarketing: MODULES.xMarketing },
    permissions: ["clipboard-read", "clipboard-write"],
  });

  test("list the store's coupons", async ({ frontend }) => {
    const coupons = frontend.coupons();

    await test.step("act: open the account coupons page", () => coupons.navigate());

    await test.step("assert: coupon cards with codes are shown", async () => {
      await expect(coupons.cards.first()).toBeVisible();
      await expect(coupons.card(0).code).toHaveText(NOT_EMPTY);
    });
  });

  test("copy a coupon code", async ({ frontend }) => {
    const coupons = frontend.coupons();
    const card = coupons.card(0);
    const code = await test.step("arrange: the first coupon's code", async () => {
      await coupons.navigate();
      await expect(card.code).toHaveText(NOT_EMPTY);
      return (await card.code.textContent())?.trim() ?? "";
    });

    await test.step("act: click the code", () => card.codeButton.click());

    await test.step(`assert: the clipboard holds ${code}`, async () => {
      await expect.poll(async () => (await coupons.clipboardText()).trim()).toBe(code);
    });
  });
});
