import * as allure from "allure-js-commons";

import { Logger } from "@core/logger";
import { envPlaceholders } from "@dataset/placeholders";
import { seedFinishers } from "@dataset/seed/finishers";
import { parseSeedOnly, resolveSeedScope } from "@dataset/seed/seed-scope";
import { seedDataset } from "@dataset/seed/seeder";
import { test } from "@fixtures";

const SEED_TIMEOUT_MS = 15 * 60_000;

test.describe.configure({ timeout: SEED_TIMEOUT_MS });

test("seed the dataset", async ({ api, dataset, env }) => {
  await allure.epic("Setup");
  await allure.feature("Dataset");
  await allure.description(
    "Seeds every dataset collection, or those SEED_ONLY lists, as the platform administrator from the environment.",
  );
  const admin = await test.step("arrange: sign in as the platform administrator", () => api.as(env.admin));
  const logger = new Logger("seed");
  const scope = await test.step("arrange: the collections to seed", async () =>
    resolveSeedScope(await admin.rest.modules.getInstalledIds(), parseSeedOnly(env.seedOnly)));

  await test.step("act: seed the collections", () =>
    seedDataset({
      http: admin.http,
      dataset,
      placeholders: envPlaceholders(env),
      logger,
      scope,
      finishers: seedFinishers(admin.rest, admin.auth, dataset, logger),
    }));
});
