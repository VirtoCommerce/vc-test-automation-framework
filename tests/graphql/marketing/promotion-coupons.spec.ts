import * as allure from "allure-js-commons";

import { GetPromotionCouponsDocument } from "@api/graphql/generated/graphql";
import { requireDefined } from "@core/required-fields";
import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";

const CUSTOMER = "acme_store_employee_1@acme.com";
const ALL_COUPONS = 100;
const LABELED_COUPON = "QA10OFF";
const LABELED_COUPON_LABEL = "10% Off - en";
const END_DATED_COUPON = "SPRING15";
const END_DATE_YEAR = "2030";
const UNAUTHORIZED = "Unauthorized";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Marketing / Promotion coupons");
});

test.describe("promotion coupons (signed-in customer)", () => {
  test.use({ user: CUSTOMER, requiresModules: [MODULES.xMarketing] });

  test("list the store's coupons with their labels and end dates", async ({ api }) => {
    await allure.story("Coupon list");
    await allure.description(
      `Every coupon has a code and a label; ${LABELED_COUPON} shows its localized label, not its promotion name, ` +
        `and ${END_DATED_COUPON} ends in ${END_DATE_YEAR}.`,
    );

    const { promotionCoupons } = await test.step("act: list the store's coupons", async () =>
      api.graphql.execute(GetPromotionCouponsDocument, { ...(await api.storeContext()), first: ALL_COUPONS }));

    await test.step("assert: every coupon has a code and a label", () => {
      const coupons = requireDefined(promotionCoupons?.items, "Promotion coupons");
      expect(coupons.length).toBeGreaterThan(0);
      expect(coupons.filter((coupon) => !coupon?.couponCode || !coupon.label)).toEqual([]);
    });
    await test.step(`assert: ${LABELED_COUPON} has its localized label`, () => {
      expect(promotionCoupons?.items?.find((coupon) => coupon?.couponCode === LABELED_COUPON)).toMatchObject({
        label: LABELED_COUPON_LABEL,
        name: expect.not.stringMatching(new RegExp(`^${LABELED_COUPON_LABEL}$`)),
      });
    });
    await test.step(`assert: ${END_DATED_COUPON} ends in ${END_DATE_YEAR}`, () => {
      expect(promotionCoupons?.items?.find((coupon) => coupon?.couponCode === END_DATED_COUPON)?.endDate).toMatch(
        new RegExp(`^${END_DATE_YEAR}-`),
      );
    });
  });

  test("limit and sort the store's coupons", async ({ api }) => {
    await allure.story("Paging and sorting");
    await allure.description(
      "first: 1 returns one coupon of the full list, and sorting by name ascending is the reverse of descending.",
    );
    const context = await api.storeContext();
    const { promotionCoupons: all } = await test.step("arrange: the full coupon list", () =>
      api.graphql.execute(GetPromotionCouponsDocument, { ...context, first: ALL_COUPONS }));
    const allIds = requireDefined(all?.items, "Promotion coupons").map((coupon) => coupon?.id);

    const { promotionCoupons: page } = await test.step("act: list the first coupon only", () =>
      api.graphql.execute(GetPromotionCouponsDocument, { ...context, first: 1 }));
    await test.step("assert: one coupon of the full list is returned", () => {
      expect(page?.items).toHaveLength(1);
      expect(allIds).toContain(page?.items?.[0]?.id);
    });

    const [ascending, descending] = await test.step("act: list the coupons by name, ascending and descending", () =>
      Promise.all([
        api.graphql.execute(GetPromotionCouponsDocument, { ...context, first: ALL_COUPONS, sort: "name:asc" }),
        api.graphql.execute(GetPromotionCouponsDocument, { ...context, first: ALL_COUPONS, sort: "name:desc" }),
      ]));
    await test.step("assert: both orders hold every coupon, the descending names reversing the ascending ones", () => {
      const ascendingCoupons = requireDefined(ascending.promotionCoupons?.items, "Ascending coupons");
      const descendingCoupons = requireDefined(descending.promotionCoupons?.items, "Descending coupons");
      expect(ascendingCoupons.map((coupon) => coupon?.id).sort()).toEqual([...allIds].sort());
      expect(descendingCoupons.map((coupon) => coupon?.id).sort()).toEqual([...allIds].sort());
      expect(ascendingCoupons.map((coupon) => coupon?.name)).toEqual(
        descendingCoupons.map((coupon) => coupon?.name).reverse(),
      );
      expect(ascendingCoupons.map((coupon) => coupon?.name)).not.toEqual(
        descendingCoupons.map((coupon) => coupon?.name),
      );
    });
  });
});

test.describe("promotion coupons (anonymous)", () => {
  test.use({ requiresModules: [MODULES.xMarketing] });

  test("anonymous visitors cannot list the coupons", async ({ api }) => {
    await allure.story("Access");
    await allure.description("promotionCoupons refuses an anonymous visitor.");

    const listing = test.step("act: list the coupons anonymously", async () =>
      api.graphql.execute(GetPromotionCouponsDocument, { ...(await api.storeContext()), first: ALL_COUPONS }));

    await test.step(`assert: the query is refused as ${UNAUTHORIZED}`, async () => {
      await expect(listing).rejects.toBeGraphqlError(UNAUTHORIZED);
    });
  });
});
