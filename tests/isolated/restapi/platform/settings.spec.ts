import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

const BOOLEAN_SETTING = "Inventory.LogInventoryChanges";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Platform / Settings");
});

test.describe("platform settings (store administrator, global settings)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("toggle a boolean setting", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description(`The inverted value of ${BOOLEAN_SETTING} is stored.`);
    const original = await test.step(`arrange: ${BOOLEAN_SETTING} is restored after the test`, () =>
      arrange.platform.restoreSettingLater(BOOLEAN_SETTING));
    const toggled = !(original.value ?? original.defaultValue);

    await test.step(`act: set ${BOOLEAN_SETTING} to ${toggled}`, () =>
      api.rest.settings.save([{ ...original, value: toggled }]));

    await test.step("assert: the setting has the new value", async () => {
      expect((await api.rest.settings.get(BOOLEAN_SETTING)).value).toBe(toggled);
    });
  });
});
