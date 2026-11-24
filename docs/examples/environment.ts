import { absoluteUrl, envSchema, parseEnv, positiveInt } from "@virtocommerce/test-automation-framework/core";

export const suiteEnvSchema = envSchema.extend({
  API_WORKERS: positiveInt.default(8),
  MAILBOX_URL: absoluteUrl,
});

export const env = parseEnv(suiteEnvSchema);
