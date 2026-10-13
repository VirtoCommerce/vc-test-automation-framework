import { mergeExpects } from "@playwright/test";

import { apiExpect } from "@api/api-matchers";

import { test as browserTest } from "./browser.fixture";

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

/** Playwright `expect` extended with the project's API matchers; import it from `@fixtures`. */
export const expect = mergeExpects(apiExpect);

export { knownIssue } from "./known-issue";
