import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

const CATALOG_MODULE_ID = "VirtoCommerce.Catalog";
const REQUIRED_APP_IDS = ["platform", "page-builder-shell"];
const PLATFORM_VERSION = /^\d+\.\d+\.\d+/;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Platform / System");
});

test.describe("platform system (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("list the installed apps", async ({ api }) => {
    await allure.story("Apps");
    await allure.description("The back office and the page builder shell are installed.");

    const apps = await test.step("act: list the apps", () => api.rest.platform.apps.list());

    await test.step(`assert: ${REQUIRED_APP_IDS.join(" and ")} are installed`, () => {
      expect(apps.map(({ id }) => id)).toEqual(expect.arrayContaining(REQUIRED_APP_IDS));
    });
  });

  test("get the system info", async ({ api }) => {
    await allure.story("Diagnostics");
    await allure.description("The system info reports the platform version and a 64-bit process.");

    const systemInfo = await test.step("act: get the system info", () => api.rest.platform.getSystemInfo());

    await test.step("assert: the version is a semantic version, in a 64-bit process", () => {
      expect(systemInfo).toMatchObject({
        platformVersion: expect.stringMatching(PLATFORM_VERSION),
        is64BitProcess: true,
      });
    });
  });

  test("no module has load errors", async ({ api }) => {
    await allure.story("Diagnostics");
    await allure.description("Every module loaded without errors.");

    const modules = await test.step("act: list the modules with errors", () =>
      api.rest.platform.listModulesWithErrors());

    await test.step("assert: there are none", () => {
      expect(modules.map(({ id }) => id)).toEqual([]);
    });
  });

  test("list the installed modules", async ({ api }) => {
    await allure.story("Modules");
    await allure.description("The catalog module is installed.");

    const moduleIds = await test.step("act: list the installed modules", () => api.rest.modules.getInstalledIds());

    await test.step(`assert: ${CATALOG_MODULE_ID} is installed`, () => {
      expect([...moduleIds]).toContain(CATALOG_MODULE_ID);
    });
  });
});
