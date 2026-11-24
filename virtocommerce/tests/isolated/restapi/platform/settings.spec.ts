import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { saveSetting, settingOf } from "@support/settings.ts";
import { DESTRUCTIVE_TAG } from "@virtocommerce/test-automation-framework/core";

const BOOLEAN_SETTING = "Inventory.LogInventoryChanges";

test.describe("platform settings (store administrator, global settings)", { tag: DESTRUCTIVE_TAG }, () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("toggle a boolean setting", async ({ api, arrange }) => {
    const original = await test.step(`arrange: ${BOOLEAN_SETTING} is restored after the test`, () =>
      arrange.platform.restoreSettingLater(BOOLEAN_SETTING));
    const toggled = !(original.value ?? original.defaultValue);

    await test.step(`act: set ${BOOLEAN_SETTING} to ${toggled}`, () =>
      saveSetting(api, { ...original, value: toggled }));

    await test.step("assert: the setting has the new value", async () => {
      expect((await settingOf(api, BOOLEAN_SETTING)).value).toBe(toggled);
    });
  });
});
