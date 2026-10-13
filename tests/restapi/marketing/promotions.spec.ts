import { randomUUID } from "node:crypto";

import * as allure from "allure-js-commons";

import { newCoupon, newPromotion } from "@dataset/builders/marketing";
import { expect, test } from "@fixtures";

const UPDATED_FIELDS = ["name", "description"] as const;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Marketing / Promotions");
});

test.describe("promotions (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("create a promotion", async ({ api, cleanup }) => {
    await allure.story("Create");
    await allure.description("A new promotion keeps its name and stays inactive.");
    const draft = newPromotion();
    cleanup.push(`delete promotion ${draft.name}`, () => api.rest.promotions.delete([draft.id]));

    const promotion = await test.step("act: create an inactive promotion", () => api.rest.promotions.create(draft));

    await test.step("assert: the promotion is inactive", () => {
      expect(promotion).toMatchObject({ name: draft.name, isActive: false });
    });
  });

  test("get a new promotion template", async ({ api }) => {
    await allure.story("Create");
    await allure.description("The template of a new promotion is unsaved and has a condition and reward tree.");

    const template = await test.step("act: get a new promotion template", () => api.rest.promotions.template());

    await test.step("assert: the template has no id and a PromotionConditionAndRewardTree", () => {
      expect(template.id ?? undefined).toBeUndefined();
      expect(template.dynamicExpression).toMatchObject({ id: "PromotionConditionAndRewardTree" });
    });
  });

  test("get a promotion by id", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("A promotion is read back by its id with the name it was created with.");
    const promotion = await test.step("arrange: a promotion", () => arrange.marketing.promotion());

    const reloaded = await test.step("act: get the promotion", () => api.rest.promotions.get(promotion.id));

    await test.step("assert: the fields match the created promotion", () => {
      expect(reloaded).toMatchObject({ id: promotion.id, name: promotion.name });
    });
  });

  test("search promotions by keyword", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description("Searching promotions by a promotion's name finds it.");
    const promotion = await test.step("arrange: a promotion", () => arrange.marketing.promotion());

    const found = await test.step("act: search promotions by its name", () =>
      api.rest.promotions.search({ keyword: promotion.name }));

    await test.step("assert: the promotion is found", () => {
      expect(found.map(({ id }) => id)).toContain(promotion.id);
    });
  });

  for (const field of UPDATED_FIELDS) {
    test(`change the ${field} of a promotion`, async ({ api, arrange }) => {
      await allure.story("Update");
      await allure.description(`A promotion's new ${field} is stored.`);
      const promotion = await test.step("arrange: a promotion", () => arrange.marketing.promotion());
      const value = `${promotion.name} ${field} changed`;

      await test.step(`act: change the promotion's ${field}`, () =>
        api.rest.promotions.update({ ...promotion, [field]: value }));

      await test.step(`assert: the promotion has the new ${field}`, async () => {
        expect((await api.rest.promotions.get(promotion.id))[field]).toBe(value);
      });
    });
  }

  test("delete a promotion", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A deleted promotion is no longer found.");
    const promotion = await test.step("arrange: a promotion", () => arrange.marketing.promotion());

    await test.step("act: delete the promotion", () => api.rest.promotions.delete([promotion.id]));

    await test.step("assert: the promotion is not found", async () => {
      expect(await api.rest.promotions.find(promotion.id)).toBeUndefined();
    });
  });

  test("add, change and delete a coupon of a promotion", async ({ api, arrange, cleanup }) => {
    await allure.story("Coupons");
    await allure.description(
      "A coupon added to a promotion is its only coupon, with its limits; a changed code and limits are stored; " +
        "a deleted coupon is gone.",
    );
    const { coupons } = api.rest.promotions;
    const promotion = await test.step("arrange: a promotion", () => arrange.marketing.promotion());
    const draft = { ...newCoupon(promotion.id, { maxUsesNumber: 15, maxUsesPerUser: 10 }), id: randomUUID() };
    cleanup.push(`delete coupon ${draft.code}`, () => coupons.delete([draft.id]));

    await test.step("act: add a coupon with 15 uses, 10 per user", () => coupons.saveMany([draft]));
    const coupon = await test.step("assert: the coupon is the promotion's only coupon, with its limits", async () => {
      expect((await coupons.search({ promotionId: promotion.id })).map(({ code }) => code)).toEqual([draft.code]);
      const found = await coupons.getByCode(promotion.id, draft.code);
      expect(found).toMatchObject({ id: draft.id, maxUsesNumber: 15, maxUsesPerUser: 10 });
      return found;
    });
    const changed = { ...coupon, code: `${coupon.code}-CHANGED`, maxUsesNumber: 17, maxUsesPerUser: 12 };

    await test.step("act: change the code and the limits to 17 uses, 12 per user", () => coupons.saveMany([changed]));
    await test.step("assert: the coupon has the new code and limits", async () => {
      expect(await coupons.get(coupon.id)).toMatchObject({ code: changed.code, maxUsesNumber: 17, maxUsesPerUser: 12 });
    });

    await test.step("act: delete the coupon", () => coupons.delete([coupon.id]));
    await test.step("assert: the coupon is gone", async () => {
      expect(await coupons.find(coupon.id)).toBeUndefined();
      expect((await coupons.search({ promotionId: promotion.id })).map(({ id }) => id)).not.toContain(coupon.id);
    });
  });
});
