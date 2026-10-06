import type { HttpClient } from "@api/http/http-client";
import type { ManifestItemName } from "@dataset/manifest";

import { ModulesClient } from "@api/rest/clients/modules-client";
import { PageBuilderClient } from "@api/rest/clients/page-builder-client";
import { ShippingMethodsClient } from "@api/rest/clients/shipping-methods-client";
import { getEnv } from "@core/env";
import { createLogger } from "@core/logger";
import { applyPageStatuses } from "@dataset/page-statuses";
import { parseSeedOnly, resolveSeedScope } from "@dataset/seed-scope";
import { seedDataset } from "@dataset/seeder";
import { ensureShippingMethods } from "@dataset/shipping-methods";
import { test } from "@fixtures";

const SEED_TIMEOUT_MS = 15 * 60_000;
const SEED_ONLY = parseSeedOnly(getEnv().seedOnly);

test.use({ user: async ({ env }, use) => use(env.admin) });
test.describe.configure({ mode: "serial", timeout: SEED_TIMEOUT_MS });

test("seed dataset", async ({ httpClient, dataset }) => {
  await seedDataset(httpClient, dataset, createLogger("seed"), { only: SEED_ONLY });
});

test("apply page statuses", async ({ httpClient, dataset }) => {
  await skipUnlessSeeded(httpClient, ["pages", "pagesContent"]);

  await applyPageStatuses(new PageBuilderClient(httpClient), dataset, createLogger("page-statuses"));
});

test("verify shipping methods", async ({ httpClient, dataset }) => {
  await skipUnlessSeeded(httpClient, ["shippingMethods"]);

  await ensureShippingMethods(new ShippingMethodsClient(httpClient), dataset, createLogger("shipping-methods"));
});

async function skipUnlessSeeded(httpClient: HttpClient, names: readonly ManifestItemName[]): Promise<void> {
  const { entities } = resolveSeedScope(await new ModulesClient(httpClient).getInstalledIds(), SEED_ONLY);
  test.skip(
    !entities.some((entity) => names.includes(entity.name)),
    `${names.join(", ")} not seeded in this run (SEED_ONLY or module not installed)`,
  );
}
