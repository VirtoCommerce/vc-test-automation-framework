import type { Dataset } from "@dataset/dataset";
import type { StoreUnderTest } from "@dataset/store-under-test";

import { loadDataset } from "@dataset/dataset";
import { envPlaceholders } from "@dataset/placeholders";
import { storeUnderTest } from "@dataset/store-under-test";

import { test as envTest } from "./env.fixture";

/** The seeded data, shared by every test of a worker. */
export interface DatasetFixtures {
  /** Every dataset collection with env placeholders resolved; loaded once per worker, records frozen. */
  readonly dataset: Dataset;
  /** The store under test (`env.storeId`) as seeded: its catalog, default language and currency. */
  readonly store: StoreUnderTest;
}

/** Adds the worker-scoped {@link DatasetFixtures} on top of `env`. */
export const test = envTest.extend<object, DatasetFixtures>({
  dataset: [
    async ({ env }, use) => {
      await use(loadDataset(envPlaceholders(env)));
    },
    { scope: "worker" },
  ],

  store: [
    async ({ dataset, env }, use) => {
      await use(storeUnderTest(dataset, env.storeId));
    },
    { scope: "worker" },
  ],
});
