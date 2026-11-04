import { CleanupError, CleanupStack } from "@core/cleanup-stack";

import { test as apiTest } from "./api.fixture";
import { issuesExplaining, markKnownIssues } from "./known-issue";

/** Undo actions of a test. */
export interface CleanupFixtures {
  /**
   * Runs the undo actions after the test, last first, as `cleanup: <description>` steps. A test whose every error,
   * its own and its cleanup's, matches a tracked issue's `failure` is reported as an expected failure of it.
   */
  readonly cleanup: CleanupStack;
}

/** Adds {@link CleanupFixtures}; depends on `api` so the session is still signed in while cleanup runs. */
export const test = apiTest.extend<CleanupFixtures>({
  cleanup: async ({ api: _signedInBeforeCleanup }, use, testInfo) => {
    const cleanup = new CleanupStack();
    await use(cleanup);
    const cleanupErrors: string[] = [];
    try {
      await cleanup.unwind((description, action) => apiTest.step(`cleanup: ${description}`, action));
    } catch (error) {
      cleanupErrors.push(
        ...(error instanceof CleanupError ? error.failures : [String(error)]).map((failure) => `cleanup: ${failure}`),
      );
      throw error;
    } finally {
      const hits = issuesExplaining([...testInfo.errors.map((error) => error.message ?? ""), ...cleanupErrors]);
      if (hits !== undefined) {
        await markKnownIssues(testInfo, hits);
      }
    }
  },
});
