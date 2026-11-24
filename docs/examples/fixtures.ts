import type { Credentials } from "@virtocommerce/test-automation-framework/auth";
import type { DefaultFixtures, DefaultWorkerFixtures } from "@virtocommerce/test-automation-framework/fixtures";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";
import type { ModuleRequirement } from "@virtocommerce/test-automation-framework/modules";

import { test as base, expect } from "@playwright/test";
import { envSchema, originUrl, parseEnv, Secret } from "@virtocommerce/test-automation-framework/core";
import { defaultFixtures } from "@virtocommerce/test-automation-framework/fixtures";

const suiteEnvSchema = envSchema.extend({ FRONTEND_BASE_URL: originUrl });
type SuiteEnv = ReturnType<typeof suiteEnvSchema.parse>;
const env = parseEnv(suiteEnvSchema);

const QUOTES: ModuleRequirement = { id: "VirtoCommerce.Quote", minVersion: "3.1005.0" };

const customer: Credentials = {
  username: "customer@example.com",
  password: Secret.of("Customer-Password-1"),
  storeId: "B2B-store",
};

export const test = base.extend<DefaultFixtures, DefaultWorkerFixtures<SuiteEnv>>(defaultFixtures(env)).extend<{
  customerApi: HttpClient;
}>({
  customerApi: async ({ signIn }, use) => use(await signIn(customer)),
  context: async ({ context, frontendSessions, env }, use) => {
    await context.setStorageState(await frontendSessions.signedIn(env.FRONTEND_BASE_URL, customer));
    await use(context);
  },
});

test.describe("quotes", () => {
  test.use({ modules: { QUOTES } });

  test("a customer sees their quotes", async ({ customerApi, page }) => {
    expect((await customerApi.get("/api/platform/security/currentuser")).ok).toBe(true);

    await page.goto(new URL("/account/quotes", env.FRONTEND_BASE_URL).href);
    await expect(page.getByRole("heading", { name: "Quotes" })).toBeVisible();
  });
});
