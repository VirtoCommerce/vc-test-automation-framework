import * as allure from "allure-js-commons";

import { ApiSession } from "@api/api-session";
import { TokenClient } from "@api/auth/token-client";
import { TokenManager } from "@api/auth/token-manager";
import { HttpClient } from "@api/http/http-client";
import { Logger } from "@core/logger";
import { envPlaceholders } from "@dataset/placeholders";
import { seedFinishers } from "@dataset/seed/finishers";
import { parseSeedOnly, resolveSeedScope } from "@dataset/seed/seed-scope";
import { seedDataset } from "@dataset/seed/seeder";
import { credentialsOf } from "@dataset/users";
import { test } from "@fixtures";

const SEED_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_ADMIN_PASSWORD = "store";

test.describe.configure({ timeout: SEED_TIMEOUT_MS });

test("seed the dataset", async ({ request, dataset, env, store }) => {
  await allure.epic("Setup");
  await allure.feature("Dataset");
  await allure.description(
    "Seeds every dataset collection, or those SEED_ONLY lists, as the platform administrator from the environment.",
  );
  const logger = new Logger("seed");
  logger.info(
    `signing in to ${env.backendBaseUrl} (store ${env.storeId}) as ${env.admin.username}, password of ` +
      `${env.admin.password.reveal().length} characters; equals the image default "${DEFAULT_ADMIN_PASSWORD}": ` +
      `${env.admin.password.reveal() === DEFAULT_ADMIN_PASSWORD}`,
  );
  const tokens = new TokenManager(new TokenClient(new HttpClient(request), env.storeId));
  const connection = {
    context: request,
    tokens,
    store: { storeId: store.id, cultureName: store.defaultLanguage, currencyCode: store.defaultCurrency },
  };
  const admin = await test.step("arrange: sign in as the platform administrator", () =>
    ApiSession.open(connection, (userName) => credentialsOf(dataset, userName), env.admin));

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
  await tokens.signOutAll();
});
