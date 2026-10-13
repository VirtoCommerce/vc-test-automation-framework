import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

const CATALOG_MODULE_ID = "VirtoCommerce.Catalog";
const RESTART_TIMEOUT_MS = 300_000;
const RESTART_POLL_INTERVAL_MS = 5_000;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Platform / System");
});

test.describe("platform system (store administrator, whole platform)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("reload the modules", async ({ api }) => {
    await allure.story("Modules");
    await allure.description("After the modules are reloaded, the catalog module is still installed.");

    await test.step("act: reload the modules", () => api.rest.modules.reload());

    await test.step(`assert: ${CATALOG_MODULE_ID} is still installed`, async () => {
      expect([...(await api.rest.modules.getInstalledIds())]).toContain(CATALOG_MODULE_ID);
    });
  });

  test("restart the platform", async ({ api }) => {
    test.setTimeout(RESTART_TIMEOUT_MS + 30_000);
    await allure.story("Restart");
    await allure.description("A restarted platform comes back with the same version.");
    const { platformVersion } = await test.step("arrange: the current platform version", () =>
      api.rest.platform.getSystemInfo());

    await test.step("act: restart the platform", () => api.rest.modules.restart());

    await test.step(`assert: platform ${platformVersion} comes back`, async () => {
      await expect
        .poll(async () => (await api.rest.platform.getSystemInfo()).platformVersion, {
          timeout: RESTART_TIMEOUT_MS,
          intervals: [RESTART_POLL_INTERVAL_MS],
        })
        .toBe(platformVersion);
    });
  });
});
