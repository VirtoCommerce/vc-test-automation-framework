import type { DefaultFixtures, DefaultWorkerFixtures } from "@virtocommerce/test-automation-framework/fixtures";

import { test as base } from "@playwright/test";
import { cookieSignIn } from "@virtocommerce/test-automation-framework/auth";
import { envSchema, originUrl, parseEnv } from "@virtocommerce/test-automation-framework/core";
import { defaultFixtures } from "@virtocommerce/test-automation-framework/fixtures";

const suiteEnvSchema = envSchema.extend({ FRONTEND_BASE_URL: originUrl });
type SuiteEnv = ReturnType<typeof suiteEnvSchema.parse>;
const env = parseEnv(suiteEnvSchema);

const frontendSignIn = cookieSignIn(
  async (http, { username, password, storeId }) => {
    (await http.post("/api/auth/login", { json: { username, password } })).expectOk();
    (await http.post("/api/auth/login-platform", { json: { username, password, storeId } })).expectOk();
  },
  { signOut: async (http) => (await http.post("/api/auth/logout")).expectOk() },
);

export const test = base.extend<DefaultFixtures, DefaultWorkerFixtures<SuiteEnv>>(
  defaultFixtures(env, { frontendSignIn }),
);
