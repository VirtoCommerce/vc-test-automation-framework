import { mergeTests } from "@playwright/test";

import { test as cartTest } from "./cart.fixture";
import { test as pageBuilderTest } from "./page-builder.fixture";

export type { ApiOptions } from "./api.fixture";
export type { BrowserOptions } from "./browser.fixture";
export type { SignedInCustomerAccount } from "./customer-account.fixture";
export type { Shopper } from "./shopper.fixture";

export { expect } from "@playwright/test";

export { asWorkerAdministrator } from "./api.fixture";
export { withCustomerAccount } from "./browser.fixture";
export { withItems } from "./cart.fixture";
export { seededUser } from "./dataset.fixture";

export const test = mergeTests(cartTest, pageBuilderTest);
