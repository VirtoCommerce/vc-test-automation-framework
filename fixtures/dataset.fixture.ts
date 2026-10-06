import type { TestFixture } from "@playwright/test";
import type { Credentials } from "@api/auth/credentials";
import type { Dataset } from "@dataset/dataset";

import { test as base } from "@playwright/test";

import { getCredentials, loadDataset } from "@dataset/dataset";

export interface DatasetWorkerFixtures {
  readonly dataset: Dataset;
}

export const test = base.extend<Record<never, never>, DatasetWorkerFixtures>({
  dataset: [
    async ({}, use) => {
      await use(loadDataset());
    },
    { scope: "worker" },
  ],
});

export function seededUser(username: string): TestFixture<Credentials | undefined, DatasetWorkerFixtures> {
  return async ({ dataset }, use) => {
    await use(getCredentials(dataset, username));
  };
}
