import type {
  VirtoCommerceMarketingModuleCoreModelPromotionsCoupon as Coupon,
  VirtoCommerceMarketingModuleCoreModelPromotionsPromotion as Promotion,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { randomUUID } from "node:crypto";

import { newCoupon, newPromotion } from "@builders/marketing.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { requireFields } from "@support/require-fields.ts";

const PROMOTIONS_PATH = "/api/marketing/promotions";
const COUPONS_PATH = `${PROMOTIONS_PATH}/coupons`;
const UPDATED_FIELDS = ["name", "description"] as const;

test.describe("promotions (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("create a promotion", async ({ api, arrange }) => {
    const draft = newPromotion();
    arrange.marketing.deletePromotionLater(draft.id);

    const promotion = await test.step("act: create an inactive promotion", async () =>
      (await api.post(PROMOTIONS_PATH, { json: draft })).expectOk().json<Promotion>());

    await test.step("assert: the promotion is inactive", () => {
      expect(promotion).toMatchObject({ name: draft.name, isActive: false });
    });
  });

  test("get a new promotion template", async ({ api }) => {
    const template = await test.step("act: get a new promotion template", async () =>
      (await api.get(`${PROMOTIONS_PATH}/new`)).expectOk().json<Promotion>());

    await test.step("assert: the template has no id and a PromotionConditionAndRewardTree", () => {
      expect(template.id ?? undefined).toBeUndefined();
      expect(template.dynamicExpression).toMatchObject({ id: "PromotionConditionAndRewardTree" });
    });
  });

  test("get a promotion by id", async ({ api, arrange }) => {
    const promotion = await test.step("arrange: a promotion", () => arrange.marketing.promotion());

    const reloaded = await test.step("act: get the promotion", async () =>
      (await api.get(`${PROMOTIONS_PATH}/${promotion.id}`)).optionalJson<Promotion>({ allow404: true }));

    await test.step("assert: the fields match the created promotion", () => {
      expect(reloaded).toMatchObject({ id: promotion.id, name: promotion.name });
    });
  });

  test("search promotions by keyword", async ({ api, arrange }) => {
    const promotion = await test.step("arrange: a promotion", () => arrange.marketing.promotion());

    const ids = await test.step("act: search promotions by its name", async () =>
      (await search<Promotion>(api, `${PROMOTIONS_PATH}/search`, { keyword: promotion.name })).map(({ id }) => id));

    await test.step("assert: the promotion is found", () => {
      expect(ids).toContain(promotion.id);
    });
  });

  for (const field of UPDATED_FIELDS) {
    test(`change the ${field} of a promotion`, async ({ api, arrange }) => {
      const promotion = await test.step("arrange: a promotion", () => arrange.marketing.promotion());
      const value = `${promotion.name} ${field} changed`;

      await test.step(`act: change the promotion's ${field}`, async () =>
        (await api.put(PROMOTIONS_PATH, { json: { ...promotion, [field]: value } })).expectOk());

      await test.step(`assert: the promotion has the new ${field}`, async () => {
        expect(
          (await api.get(`${PROMOTIONS_PATH}/${promotion.id}`)).optionalJson<Promotion>({ allow404: true })?.[field],
        ).toBe(value);
      });
    });
  }

  test("delete a promotion", async ({ api, arrange }) => {
    const promotion = await test.step("arrange: a promotion", () => arrange.marketing.promotion());

    await test.step("act: delete the promotion", async () =>
      (await api.delete(PROMOTIONS_PATH, { query: { ids: [promotion.id] } })).expectOk());

    await test.step("assert: the promotion is not found", async () => {
      expect(
        (await api.get(`${PROMOTIONS_PATH}/${promotion.id}`)).optionalJson<Promotion>({ allow404: true }),
      ).toBeUndefined();
    });
  });

  test("add, change and delete a coupon of a promotion", async ({ api, arrange }) => {
    const promotion = await test.step("arrange: a promotion", () => arrange.marketing.promotion());
    const draft = { ...newCoupon(promotion.id, { maxUsesNumber: 15, maxUsesPerUser: 10 }), id: randomUUID() };
    arrange.marketing.deleteCouponLater(draft.id);

    await test.step("act: add a coupon with 15 uses, 10 per user", async () =>
      (await api.post(`${COUPONS_PATH}/add`, { json: [draft] })).expectOk());
    const coupon = await test.step("assert: the coupon is the promotion's only coupon, with its limits", async () => {
      const coupons = await search<Coupon>(api, `${COUPONS_PATH}/search`, { promotionId: promotion.id });
      expect(coupons.map(({ code }) => code)).toEqual([draft.code]);
      const added = requireFields(
        coupons.find(({ code }) => code === draft.code),
        ["id", "code"],
        `Coupon ${draft.code}`,
      );
      expect(added).toMatchObject({ id: draft.id, maxUsesNumber: 15, maxUsesPerUser: 10 });
      return added;
    });
    const changed = { ...coupon, code: `${coupon.code}-CHANGED`, maxUsesNumber: 17, maxUsesPerUser: 12 };

    await test.step("act: change the code and the limits to 17 uses, 12 per user", async () =>
      (await api.post(`${COUPONS_PATH}/add`, { json: [changed] })).expectOk());
    await test.step("assert: the coupon has the new code and limits", async () => {
      expect((await api.get(`${COUPONS_PATH}/${coupon.id}`)).optionalJson<Coupon>()).toMatchObject({
        code: changed.code,
        maxUsesNumber: 17,
        maxUsesPerUser: 12,
      });
    });

    await test.step("act: delete the coupon", async () =>
      (await api.delete(`${COUPONS_PATH}/delete`, { query: { ids: [coupon.id] } })).expectOk());
    await test.step("assert: the coupon is gone", async () => {
      expect((await api.get(`${COUPONS_PATH}/${coupon.id}`)).optionalJson<Coupon>()).toBeUndefined();
      const coupons = await search<Coupon>(api, `${COUPONS_PATH}/search`, { promotionId: promotion.id });
      expect(coupons.map(({ id }) => id)).not.toContain(coupon.id);
    });
  });
});

async function search<T>(api: HttpClient, path: string, criteria: Record<string, unknown>): Promise<T[]> {
  return (await api.post(path, { json: criteria })).expectOk().json<{ results?: T[] | null }>().results ?? [];
}
