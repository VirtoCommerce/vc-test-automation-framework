import { CleanupStack } from "@core/cleanup-stack";

import { test as apiTest } from "./api.fixture";

/** Undo actions of a test. */
export interface CleanupFixtures {
  /** Runs registered undo actions after the test, last first, each as a `cleanup: <description>` report step. */
  readonly cleanup: CleanupStack;
}

/** Adds {@link CleanupFixtures}; depends on `api` so the session is still signed in while cleanup runs. */
export const test = apiTest.extend<CleanupFixtures>({
  cleanup: async ({ api: _signedInBeforeCleanup }, use) => {
    const cleanup = new CleanupStack();
    await use(cleanup);
    await cleanup.unwind((description, action) => apiTest.step(`cleanup: ${description}`, action));
  },
});
