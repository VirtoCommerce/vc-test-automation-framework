import * as allure from "allure-js-commons";

import { MODULES } from "@dataset/modules";
import { expect, test } from "@fixtures";

const CATALOG_MODULE_ID = "VirtoCommerce.Catalog";
const PAGE_BUILDER_SHELL_APP_ID = "page-builder-shell";
const BACK_OFFICE_APP_ID = "platform";
const PLATFORM_VERSION = /^\d+\.\d+\.\d+/;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Platform / System");
});

test.describe("platform system (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("list the installed apps", async ({ api }) => {
    await allure.story("Apps");
    await allure.description("The page builder shell is installed.");

    const apps = await test.step("act: list the apps", () => api.rest.platform.apps.list());

    await test.step(`assert: ${PAGE_BUILDER_SHELL_APP_ID} is installed`, () => {
      expect(apps.map(({ id }) => id)).toContain(PAGE_BUILDER_SHELL_APP_ID);
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

    const modules = await test.step("act: list the installed modules", () => api.rest.modules.getInstalled());

    await test.step(`assert: ${CATALOG_MODULE_ID} is installed`, () => {
      expect([...modules.keys()]).toContain(CATALOG_MODULE_ID);
    });
  });
});

// The platform is API only from 3.1093.0: the back office app comes with the AngularJS admin module (VCST-6338)
test.describe("platform system with the AngularJS admin (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com", requiresModules: [MODULES.adminAngularJs] });

  test("list the back office among the apps", async ({ api }) => {
    await allure.story("Apps");
    await allure.description("The AngularJS admin module brings the back office app, Commerce Manager.");

    const apps = await test.step("act: list the apps", () => api.rest.platform.apps.list());

    await test.step(`assert: ${BACK_OFFICE_APP_ID} is installed`, () => {
      expect(apps.map(({ id }) => id)).toContain(BACK_OFFICE_APP_ID);
    });
  });
});
