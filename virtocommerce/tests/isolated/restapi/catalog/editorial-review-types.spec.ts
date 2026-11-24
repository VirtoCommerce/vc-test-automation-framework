import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { saveSetting, settingOf } from "@support/settings.ts";
import { uniqueId } from "@support/unique-id.ts";
import { DESTRUCTIVE_TAG } from "@virtocommerce/test-automation-framework/core";

const REVIEW_TYPES_SETTING = "Catalog.EditorialReviewTypes";

test.describe("editorial review types (store administrator, global settings)", { tag: DESTRUCTIVE_TAG }, () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("add and rename an editorial review type", async ({ api, arrange }) => {
    const reviewType = uniqueId("test-review-type");
    const renamedType = `${reviewType}-renamed`;
    arrange.platform.removeAllowedValuesLater(REVIEW_TYPES_SETTING, [reviewType, renamedType]);
    const setting = await test.step(`arrange: the current ${REVIEW_TYPES_SETTING}`, () =>
      settingOf(api, REVIEW_TYPES_SETTING));
    const allowedValues = setting.allowedValues ?? [];

    await test.step(`act: add ${reviewType}`, () =>
      saveSetting(api, { ...setting, allowedValues: [...allowedValues, reviewType] }));
    await test.step(`assert: ${reviewType} is a review type`, async () => {
      expect((await settingOf(api, REVIEW_TYPES_SETTING)).allowedValues).toContain(reviewType);
    });

    await test.step(`act: rename ${reviewType} to ${renamedType}`, () =>
      saveSetting(api, { ...setting, allowedValues: [...allowedValues, renamedType] }));
    await test.step(`assert: ${renamedType} replaced ${reviewType}`, async () => {
      const { allowedValues: current } = await settingOf(api, REVIEW_TYPES_SETTING);
      expect(current).toContain(renamedType);
      expect(current).not.toContain(reviewType);
    });
  });
});
