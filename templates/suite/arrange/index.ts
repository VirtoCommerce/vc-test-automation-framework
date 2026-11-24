import type { ArrangeContext } from "./context.ts";
import type { SecurityArrange } from "./security.ts";

import { test } from "@playwright/test";
import { errorMessage } from "@virtocommerce/test-automation-framework/core";

import { securityArrange } from "./security.ts";

export type { ArrangeContext } from "./context.ts";
export type { PlatformAccount, PlatformUser, SecurityArrange } from "./security.ts";

/**
 * Creates test data and removes it after the test, last first, so tests have no teardown code. Data is created as
 * the administrator. `…Later` methods create nothing: they only remove data that the code under test creates. The
 * methods are grouped by domain, one file each:
 *
 * - `security`: platform users.
 */
export interface Arrange {
  readonly security: SecurityArrange;
}

/** The `arrange` of one test, and the removal of what it created. */
export interface ArrangeSession {
  readonly arrange: Arrange;
  /**
   * Runs the removal actions, last first, each as a `cleanup:` step. Every action runs, even after one fails.
   *
   * @throws {Error} An action failed, with the failures of all of them.
   */
  readonly cleanUp: () => Promise<void>;
}

/**
 * Returns the `arrange` of one test.
 *
 * @param context - The sign-in and store that the domains use; `later` is supplied here.
 * @returns The `arrange` and its removal.
 */
export function createArrange(context: Omit<ArrangeContext, "later">): ArrangeSession {
  const undo: { readonly description: string; readonly action: () => Promise<unknown> }[] = [];
  const domainContext: ArrangeContext = {
    ...context,
    later: (description, action) => {
      undo.push({ description, action });
    },
  };

  async function cleanUp(): Promise<void> {
    const failures: string[] = [];
    for (const { description, action } of undo.reverse()) {
      try {
        await test.step(`cleanup: ${description}`, action);
      } catch (error) {
        failures.push(`${description}: ${errorMessage(error)}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`Cleanup failed:\n${failures.join("\n")}`);
    }
  }

  return {
    arrange: {
      security: securityArrange(domainContext),
    },
    cleanUp,
  };
}
