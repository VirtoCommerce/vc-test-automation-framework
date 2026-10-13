import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

const BOOLEAN_SETTING = "Inventory.LogInventoryChanges";
const CATALOG_MODULE_ID = "VirtoCommerce.Catalog";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Platform / Settings");
});

test.describe("platform settings (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("list every setting", async ({ api }) => {
    await allure.story("Read");
    await allure.description("The list of every setting includes a known module setting.");

    const settings = await test.step("act: list every setting", () => api.rest.settings.list());

    await test.step(`assert: ${BOOLEAN_SETTING} is listed`, () => {
      expect(settings.map(({ name }) => name)).toContain(BOOLEAN_SETTING);
    });
  });

  test("get a setting by name", async ({ api }) => {
    await allure.story("Read");
    await allure.description("A setting read by its name has its value type.");

    const setting = await test.step(`act: get ${BOOLEAN_SETTING}`, () => api.rest.settings.get(BOOLEAN_SETTING));

    await test.step("assert: the setting is a Boolean", () => {
      expect(setting).toMatchObject({ name: BOOLEAN_SETTING, valueType: "Boolean" });
    });
  });

  test("list the settings of a module", async ({ api }) => {
    await allure.story("Read");
    await allure.description("A module's settings are its own only.");

    const settings = await test.step(`act: list the settings of ${CATALOG_MODULE_ID}`, () =>
      api.rest.settings.listByModule(CATALOG_MODULE_ID));

    await test.step(`assert: there are settings, all of ${CATALOG_MODULE_ID}`, () => {
      expect(settings.length).toBeGreaterThan(0);
      expect(new Set(settings.map(({ moduleId }) => moduleId))).toEqual(new Set([CATALOG_MODULE_ID]));
    });
  });

  test("get the UI customization setting", async ({ api }) => {
    await allure.story("Read");
    await allure.description("The back office's UI customization is a platform setting.");

    const setting = await test.step("act: get the UI customization", () => api.rest.settings.getUiCustomization());

    await test.step("assert: the setting belongs to the platform", () => {
      expect(setting.moduleId).toBe("Platform");
    });
  });
});
