import { Arrange } from "@dataset/arrange";
import { STORE_ADMINISTRATOR } from "@dataset/users";

import { test as cleanupTest } from "./cleanup.fixture";

/** Test data setup. */
export interface ArrangeFixtures {
  /**
   * Creates test data as the dataset's store administrator, whatever the test's `user`; everything it creates
   * is removed after the test through `cleanup`.
   */
  readonly arrange: Arrange;
}

/** Adds {@link ArrangeFixtures} on top of the `cleanup` and `api` fixtures. */
export const test = cleanupTest.extend<ArrangeFixtures>({
  arrange: async ({ api, cleanup, dataset, store }, use) => {
    await use(new Arrange({ admin: await api.as(STORE_ADMINISTRATOR), cleanup, dataset, store }));
  },
});
