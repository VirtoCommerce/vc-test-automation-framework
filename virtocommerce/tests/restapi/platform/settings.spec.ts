import type { VirtoCommercePlatformCoreSettingsObjectSettingEntry as SettingEntry } from "@rest/generated/platform.ts";

import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

const SETTINGS_PATH = "/api/platform/settings";
const BOOLEAN_SETTING = "Inventory.LogInventoryChanges";
const CATALOG_MODULE_ID = "VirtoCommerce.Catalog";

test.describe("platform settings (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("list every setting", async ({ api }) => {
    const settings = await test.step("act: list every setting", async () =>
      (await api.get(SETTINGS_PATH)).expectOk().json<SettingEntry[]>());

    await test.step(`assert: ${BOOLEAN_SETTING} is listed`, () => {
      expect(settings.map(({ name }) => name)).toContain(BOOLEAN_SETTING);
    });
  });

  test("get a setting by name", async ({ api }) => {
    const setting = await test.step(`act: get ${BOOLEAN_SETTING}`, async () =>
      (await api.get(`${SETTINGS_PATH}/${BOOLEAN_SETTING}`)).expectOk().json<SettingEntry>());

    await test.step("assert: the setting is a Boolean", () => {
      expect(setting).toMatchObject({ name: BOOLEAN_SETTING, valueType: "Boolean" });
    });
  });

  test("list the settings of a module", async ({ api }) => {
    const settings = await test.step(`act: list the settings of ${CATALOG_MODULE_ID}`, async () =>
      (await api.get(`${SETTINGS_PATH}/modules/${CATALOG_MODULE_ID}`)).expectOk().json<SettingEntry[]>());

    await test.step(`assert: there are settings, all of ${CATALOG_MODULE_ID}`, () => {
      expect(settings.length).toBeGreaterThan(0);
      expect(new Set(settings.map(({ moduleId }) => moduleId))).toEqual(new Set([CATALOG_MODULE_ID]));
    });
  });

  test("get the UI customization setting", async ({ api }) => {
    const setting = await test.step("act: get the UI customization", async () =>
      (await api.get(`${SETTINGS_PATH}/ui/customization`)).expectOk().json<SettingEntry>());

    await test.step("assert: the setting belongs to the platform", () => {
      expect(setting.moduleId).toBe("Platform");
    });
  });
});
