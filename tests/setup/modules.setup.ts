import * as allure from "allure-js-commons";

import { Logger } from "@core/logger";
import { saveInstalledModules, setupTest as test } from "@fixtures";

test("read the installed modules", async ({ platformAdmin }) => {
  await allure.epic("Setup");
  await allure.feature("Platform modules");
  await allure.description(
    "Reads the platform's installed modules once per run, for the seed and for the tests that require a module.",
  );

  const installed = await test.step("act: list the installed modules", () => platformAdmin.rest.modules.getInstalled());

  await test.step("act: save them for the rest of the run", async () => {
    await saveInstalledModules(installed);
    await allure.attachment(
      "installed-modules.json",
      JSON.stringify(Object.fromEntries(installed), null, 2),
      "application/json",
    );
    new Logger("modules").info(`${installed.size} installed modules`);
  });
});
