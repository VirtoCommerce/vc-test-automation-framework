import * as allure from "allure-js-commons";

import { uniqueId } from "@core/unique-id";
import { expect, test } from "@fixtures";

const REVIEW_TYPES_SETTING = "Catalog.EditorialReviewTypes";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Catalog / Products");
});

test.describe("editorial review types (store administrator, global settings)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("add and rename an editorial review type", async ({ api, arrange }) => {
    await allure.story("Editorial reviews");
    await allure.description(`A review type added to ${REVIEW_TYPES_SETTING} can be renamed in place.`);
    const reviewType = uniqueId("test-review-type");
    const renamedType = `${reviewType}-renamed`;
    arrange.platform.removeAllowedValuesLater(REVIEW_TYPES_SETTING, [reviewType, renamedType]);
    const setting = await test.step(`arrange: the current ${REVIEW_TYPES_SETTING}`, () =>
      api.rest.settings.get(REVIEW_TYPES_SETTING));
    const allowedValues = setting.allowedValues ?? [];

    await test.step(`act: add ${reviewType}`, () =>
      api.rest.settings.save([{ ...setting, allowedValues: [...allowedValues, reviewType] }]));
    await test.step(`assert: ${reviewType} is a review type`, async () => {
      expect((await api.rest.settings.get(REVIEW_TYPES_SETTING)).allowedValues).toContain(reviewType);
    });

    await test.step(`act: rename ${reviewType} to ${renamedType}`, () =>
      api.rest.settings.save([{ ...setting, allowedValues: [...allowedValues, renamedType] }]));
    await test.step(`assert: ${renamedType} replaced ${reviewType}`, async () => {
      const { allowedValues: current } = await api.rest.settings.get(REVIEW_TYPES_SETTING);
      expect(current).toContain(renamedType);
      expect(current).not.toContain(reviewType);
    });
  });
});
