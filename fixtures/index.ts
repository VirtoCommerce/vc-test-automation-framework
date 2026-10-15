import { mergeExpects } from "@playwright/test";

import { apiExpect } from "@api/api-matchers";

import { test as browserTest } from "./browser.fixture";
import { test as setupFixturesTest } from "./setup.fixture";

export type { BrowserOptions, Shopper, ShopperKind } from "./browser.fixture";

/**
 * Playwright `test` with every project fixture; tests import it from `@fixtures`.
 * Fixture chain: `env` → `dataset`, `store` → `user`, `api` → `cleanup` → `arrange` → `shopper`, `frontend`,
 * `pageBuilder`.
 *
 * @example
 * import { expect, test } from "@fixtures";
 * test("adds to cart", async ({ arrange, shopper, frontend }) => { ... });
 */
export const test = browserTest;

/**
 * Playwright `test` for the setup projects (`modules`, `seed`), which run before the dataset exists: `env`,
 * `dataset`, `store` and `platformAdmin`, the platform administrator from the environment. It loads no browser
 * state and never signs in a dataset user.
 */
export const setupTest = setupFixturesTest;

/** Playwright `expect` extended with the project's API matchers; import it from `@fixtures`. */
export const expect = mergeExpects(apiExpect);

export { loadInstalledModules, saveInstalledModules } from "./installed-modules";
export { knownIssue } from "./known-issue";
