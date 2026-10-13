import { mergeExpects } from "@playwright/test";

import { apiExpect } from "@api/api-matchers";

import { test as browserTest } from "./browser.fixture";
import { test as datasetTest } from "./dataset.fixture";

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
 * Playwright `test` with only `env`, `dataset` and `store`, for setup that runs before the dataset exists, such as
 * the seed: it signs nobody in and loads no browser state, so it never needs a dataset user.
 */
export const setupTest = datasetTest;

/** Playwright `expect` extended with the project's API matchers; import it from `@fixtures`. */
export const expect = mergeExpects(apiExpect);

export { knownIssue } from "./known-issue";
