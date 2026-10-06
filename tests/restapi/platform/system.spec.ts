import * as allure from "allure-js-commons";

import { ModulesClient } from "@api/rest/clients/modules-client";
import { PlatformClient } from "@api/rest/clients/platform-client";
import { asWorkerAdministrator, expect, test } from "@fixtures";

const CATALOG_MODULE_ID = "VirtoCommerce.Catalog";
const RESTART_TIMEOUT_MS = 300_000;
const REQUIRED_APP_IDS = ["platform", "page-builder-shell"];
const PLATFORM_VERSION = /^\d+\.\d+\.\d+/;

test.beforeEach(async () => {
  await allure.feature("Platform / System");
});

test.describe("platform system (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  test("list installed apps", async ({ httpClient }) => {
    const platformClient = new PlatformClient(httpClient);

    const apps = await test.step("act: list apps", () => platformClient.listApps());

    await test.step("assert: the platform admin and the page-builder shell are installed", async () => {
      expect(apps.map(({ id }) => id)).toEqual(expect.arrayContaining(REQUIRED_APP_IDS));
    });
  });

  test("get system info", async ({ httpClient }) => {
    const platformClient = new PlatformClient(httpClient);

    const systemInfo = await test.step("act: get system info", () => platformClient.getSystemInfo());

    await test.step("assert: system info reports the platform version and process", async () => {
      expect(systemInfo).toMatchObject({
        platformVersion: expect.stringMatching(PLATFORM_VERSION),
        is64BitProcess: true,
      });
    });
  });

  test("no module has load errors", async ({ httpClient }) => {
    const platformClient = new PlatformClient(httpClient);

    const modules = await test.step("act: list modules with errors", () => platformClient.listModulesWithErrors());

    await test.step("assert: no module failed to load", async () => {
      expect(modules.map(({ id }) => id)).toEqual([]);
    });
  });

  test("list installed modules", async ({ httpClient }) => {
    const modulesClient = new ModulesClient(httpClient);

    const moduleIds = await test.step("act: list installed modules", () => modulesClient.getInstalledIds());

    await test.step("assert: catalog module is installed", async () => {
      expect([...moduleIds]).toContain(CATALOG_MODULE_ID);
    });
  });

  test("reload modules", { tag: "@destructive" }, async ({ httpClient }) => {
    const modulesClient = new ModulesClient(httpClient);

    await test.step("act: reload modules", () => modulesClient.reload());

    await test.step("assert: catalog module is still installed", async () => {
      expect([...(await modulesClient.getInstalledIds())]).toContain(CATALOG_MODULE_ID);
    });
  });

  test("restart the platform", { tag: "@destructive" }, async ({ httpClient }) => {
    test.setTimeout(RESTART_TIMEOUT_MS + 30_000);
    const modulesClient = new ModulesClient(httpClient);
    const platformClient = new PlatformClient(httpClient);
    const { platformVersion } = await test.step("arrange: current platform version", () =>
      platformClient.getSystemInfo());

    await test.step("act: restart platform", () => modulesClient.restart());

    await test.step(`assert: platform ${platformVersion} comes back`, async () => {
      await expect
        .poll(
          async () => {
            try {
              return (await platformClient.getSystemInfo()).platformVersion;
            } catch {
              return undefined;
            }
          },
          { timeout: RESTART_TIMEOUT_MS, intervals: [5_000] },
        )
        .toBe(platformVersion);
    });
  });
});
