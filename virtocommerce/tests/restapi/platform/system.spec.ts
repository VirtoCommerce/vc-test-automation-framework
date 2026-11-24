import type {
  VirtoCommercePlatformWebModelModularityAppDescriptor as AppDescriptor,
  VirtoCommercePlatformWebModularityModuleDescriptor as ModuleDescriptor,
  VirtoCommercePlatformWebModelDiagnosticsSystemInfo as SystemInfo,
} from "@rest/generated/platform.ts";

import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { MODULES, PAGE_BUILDER_REPLACED } from "@modules";

const CATALOG_MODULE_ID = "VirtoCommerce.Catalog";
const PAGE_BUILDER_SHELL_APP_ID = "page-builder-shell";
const BACK_OFFICE_APP_ID = "platform";
const PLATFORM_VERSION = /^\d+\.\d+\.\d+/;

test.describe("platform system (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("get the system info", async ({ api }) => {
    const systemInfo = await test.step("act: get the system info", async () =>
      (await api.get("/api/platform/diagnostics/systeminfo")).expectOk().json<SystemInfo>());

    await test.step("assert: the version is a semantic version, in a 64-bit process", () => {
      expect(systemInfo).toMatchObject({
        platformVersion: expect.stringMatching(PLATFORM_VERSION),
        is64BitProcess: true,
      });
    });
  });

  test("no module has load errors", async ({ api }) => {
    const modules = await test.step("act: list the modules with errors", async () =>
      (await api.get("/api/platform/diagnostics/errors")).expectOk().json<ModuleDescriptor[]>());

    await test.step("assert: there are none", () => {
      expect(modules.map(({ id }) => id)).toEqual([]);
    });
  });

  test("list the installed modules", async ({ api }) => {
    const modules = await test.step("act: list the installed modules", async () =>
      (await api.get("/api/platform/modules")).expectOk().json<ModuleDescriptor[]>());

    await test.step(`assert: ${CATALOG_MODULE_ID} is installed`, () => {
      expect(modules.filter(({ isInstalled }) => isInstalled).map(({ id }) => id)).toContain(CATALOG_MODULE_ID);
    });
  });
});

test.describe("platform system with the AngularJS admin (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR, modules: { adminAngularJs: MODULES.adminAngularJs } });

  test("list the back office among the apps", async ({ api }) => {
    const apps = await test.step("act: list the apps", async () =>
      (await api.get("/api/platform/apps")).expectOk().json<AppDescriptor[]>());

    await test.step(`assert: ${BACK_OFFICE_APP_ID} is installed`, () => {
      expect(apps.map(({ id }) => id)).toContain(BACK_OFFICE_APP_ID);
    });
  });
});

test.describe("platform system with the page builder (store administrator)", () => {
  test.skip(true, PAGE_BUILDER_REPLACED);
  test.use({ user: STORE_ADMINISTRATOR, modules: { pageBuilder: MODULES.pageBuilder } });

  test("list the page builder shell among the apps", async ({ api }) => {
    const apps = await test.step("act: list the apps", async () =>
      (await api.get("/api/platform/apps")).expectOk().json<AppDescriptor[]>());

    await test.step(`assert: ${PAGE_BUILDER_SHELL_APP_ID} is installed`, () => {
      expect(apps.map(({ id }) => id)).toContain(PAGE_BUILDER_SHELL_APP_ID);
    });
  });
});
