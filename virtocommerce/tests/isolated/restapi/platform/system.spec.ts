import type {
  VirtoCommercePlatformWebModularityModuleDescriptor as ModuleDescriptor,
  VirtoCommercePlatformWebModelDiagnosticsSystemInfo as SystemInfo,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { DESTRUCTIVE_TAG } from "@virtocommerce/test-automation-framework/core";

const MODULES_PATH = "/api/platform/modules";
const CATALOG_MODULE_ID = "VirtoCommerce.Catalog";
const RESTART_TIMEOUT_MS = 300_000;
const RESTART_POLL_INTERVAL_MS = 5_000;

test.describe("platform system (store administrator, whole platform)", { tag: DESTRUCTIVE_TAG }, () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("reload the modules", async ({ api }) => {
    await test.step("act: reload the modules", async () => (await api.post(`${MODULES_PATH}/reload`)).expectOk());

    await test.step(`assert: ${CATALOG_MODULE_ID} is still installed`, async () => {
      const modules = (await api.get(MODULES_PATH)).expectOk().json<ModuleDescriptor[]>();
      expect(modules.filter(({ isInstalled }) => isInstalled).map(({ id }) => id)).toContain(CATALOG_MODULE_ID);
    });
  });

  test("restart the platform", async ({ api }) => {
    test.setTimeout(RESTART_TIMEOUT_MS + 30_000);
    const { platformVersion } = await test.step("arrange: the current platform version", () => systemInfoOf(api));

    await test.step("act: restart the platform", async () => (await api.post(`${MODULES_PATH}/restart`)).expectOk());

    await test.step(`assert: platform ${platformVersion} comes back`, async () => {
      await expect
        .poll(async () => (await systemInfoOf(api)).platformVersion, {
          timeout: RESTART_TIMEOUT_MS,
          intervals: [RESTART_POLL_INTERVAL_MS],
        })
        .toBe(platformVersion);
    });
  });
});

async function systemInfoOf(api: HttpClient): Promise<SystemInfo> {
  return (await api.get("/api/platform/diagnostics/systeminfo")).expectOk().json<SystemInfo>();
}
