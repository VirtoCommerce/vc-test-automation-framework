import { expect, test } from "@playwright/test";

import { absoluteUrl, envSchema, MASKED, parseEnv, positiveInt, Secret } from "@/core";

const REQUIRED = {
  BACKEND_BASE_URL: "https://Platform.example:443/",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "Platform-Password-1",
};

test.describe("envSchema", () => {
  test("parses the required variables and applies the defaults", () => {
    const env = parseEnv(envSchema, REQUIRED);

    expect(env).toMatchObject({
      BACKEND_BASE_URL: "https://platform.example",
      ADMIN_USERNAME: "admin",
      VERIFY_SSL: true,
      REQUEST_TIMEOUT_MS: 30_000,
      RUN_DESTRUCTIVE_TESTS: false,
      API_WORKERS: 4,
      E2E_WORKERS: 3,
    });
    expect(env.ADMIN_PASSWORD).toBeInstanceOf(Secret);
    expect(env.ADMIN_PASSWORD.reveal()).toBe("Platform-Password-1");
    expect(String(env.ADMIN_PASSWORD)).toBe(MASKED);
  });

  test("parses the optional variables when set", () => {
    const env = parseEnv(envSchema, {
      ...REQUIRED,
      VERIFY_SSL: "false",
      REQUEST_TIMEOUT_MS: "5000",
      RUN_DESTRUCTIVE_TESTS: "true",
      API_WORKERS: "8",
      E2E_WORKERS: "6",
    });

    expect(env).toMatchObject({
      VERIFY_SSL: false,
      REQUEST_TIMEOUT_MS: 5_000,
      RUN_DESTRUCTIVE_TESTS: true,
      API_WORKERS: 8,
      E2E_WORKERS: 6,
    });
  });

  for (const name of Object.keys(REQUIRED)) {
    test(`requires ${name}`, () => {
      const { [name as keyof typeof REQUIRED]: _, ...rest } = REQUIRED;

      expect(() => parseEnv(envSchema, rest)).toThrow(`→ at ${name}`);
    });
  }

  test("rejects a base URL with a path", () => {
    expect(() => parseEnv(envSchema, { ...REQUIRED, BACKEND_BASE_URL: "https://platform.example/admin" })).toThrow(
      "→ at BACKEND_BASE_URL",
    );
  });

  test("lets a test suite add variables and override a default", () => {
    const schema = envSchema.extend({ API_WORKERS: positiveInt.default(8), MAILBOX_URL: absoluteUrl });

    expect(parseEnv(schema, { ...REQUIRED, MAILBOX_URL: "https://mail.example.com/inbox" })).toMatchObject({
      API_WORKERS: 8,
      MAILBOX_URL: "https://mail.example.com/inbox",
    });
  });
});
