import { expect, test } from "@playwright/test";

import { getEnv, parseEnv } from "@core/env";
import { Secret } from "@core/secret";

const REQUIRED = {
  BACKEND_BASE_URL: "http://localhost:8090",
  FRONTEND_BASE_URL: "https://localhost:3000",
  STORE_ID: "store-acme",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "env-admin-password",
  USERS_PASSWORD: "env-users-password",
} as const;

test.describe("parseEnv", () => {
  test("maps the required variables and applies every default", () => {
    const env = parseEnv(REQUIRED);

    expect(env).toEqual({
      backendBaseUrl: "http://localhost:8090",
      frontendBaseUrl: "https://localhost:3000",
      pageBuilderPath: "/apps/page-builder-shell/",
      storeId: "store-acme",
      admin: { username: "admin", password: expect.any(Secret) },
      usersPassword: expect.any(Secret),
      googleMapsApiKey: expect.any(Secret),
      requestTimeoutMs: 30_000,
      verifySsl: true,
      runDestructiveTests: false,
      apiWorkers: 4,
      frontendWorkers: 3,
      quantityControl: "stepper",
      rangeFilterType: "slider",
      checkoutMode: "single-page",
      seedOnly: undefined,
    });
    expect(env.admin.password.reveal()).toBe("env-admin-password");
    expect(env.usersPassword.reveal()).toBe("env-users-password");
    expect(env.googleMapsApiKey.reveal()).toBe("");
  });

  test("uses the given optional values instead of the defaults", () => {
    const env = parseEnv({
      ...REQUIRED,
      PAGE_BUILDER_PATH: "/apps/shell/",
      GOOGLE_MAPS_API_KEY: "env-maps-key",
      REQUEST_TIMEOUT_MS: "5000",
      VERIFY_SSL: "false",
      RUN_DESTRUCTIVE_TESTS: "true",
      API_WORKERS: "2",
      FRONTEND_WORKERS: "1",
      QUANTITY_CONTROL: "button",
      RANGE_FILTER_TYPE: "default",
      CHECKOUT_MODE: "multi-step",
      SEED_ONLY: "users,contacts",
    });

    expect(env).toMatchObject({
      pageBuilderPath: "/apps/shell/",
      requestTimeoutMs: 5000,
      verifySsl: false,
      runDestructiveTests: true,
      apiWorkers: 2,
      frontendWorkers: 1,
      quantityControl: "button",
      rangeFilterType: "default",
      checkoutMode: "multi-step",
      seedOnly: "users,contacts",
    });
    expect(env.googleMapsApiKey.reveal()).toBe("env-maps-key");
  });

  test("reads an empty optional variable as unset and applies its default", () => {
    const blank = {
      PAGE_BUILDER_PATH: "",
      GOOGLE_MAPS_API_KEY: "",
      REQUEST_TIMEOUT_MS: "",
      VERIFY_SSL: "",
      RUN_DESTRUCTIVE_TESTS: "",
      API_WORKERS: "",
      FRONTEND_WORKERS: "",
      QUANTITY_CONTROL: "",
      RANGE_FILTER_TYPE: "",
      CHECKOUT_MODE: "",
      SEED_ONLY: "",
    };

    expect(parseEnv({ ...REQUIRED, ...blank })).toEqual(parseEnv(REQUIRED));
  });

  test("ignores variables it does not know", () => {
    expect(parseEnv({ ...REQUIRED, PATH: "/usr/bin" })).not.toHaveProperty("PATH");
  });

  test("keeps the spaces of a password", () => {
    expect(parseEnv({ ...REQUIRED, ADMIN_PASSWORD: " pass word " }).admin.password.reveal()).toBe(" pass word ");
  });

  test("returns a frozen configuration", () => {
    const env = parseEnv(REQUIRED);

    expect(Object.isFrozen(env)).toBe(true);
    expect(Object.isFrozen(env.admin)).toBe(true);
  });

  test("never prints the passwords", () => {
    const printed = JSON.stringify(parseEnv(REQUIRED));

    expect(printed).not.toContain("env-admin-password");
    expect(printed).not.toContain("env-users-password");
  });

  test.describe("required variables", () => {
    for (const name of Object.keys(REQUIRED)) {
      test(`rejects a missing ${name}`, () => {
        const { [name as keyof typeof REQUIRED]: _missing, ...rest } = REQUIRED;

        expect(() => parseEnv(rest)).toThrow(name);
      });
    }

    for (const name of ["STORE_ID", "ADMIN_USERNAME", "ADMIN_PASSWORD", "USERS_PASSWORD"]) {
      for (const value of ["", "   "]) {
        test(`rejects ${name}=${JSON.stringify(value)}`, () => {
          expect(() => parseEnv({ ...REQUIRED, [name]: value })).toThrow(name);
        });
      }
    }

    test("names every invalid variable in one error", () => {
      expect(() => parseEnv({})).toThrow(
        /^Invalid environment:\n(?=[\s\S]*BACKEND_BASE_URL)(?=[\s\S]*STORE_ID)(?=[\s\S]*ADMIN_PASSWORD)/,
      );
    });
  });

  test.describe("formats", () => {
    for (const [name, value] of [
      ["BACKEND_BASE_URL", "localhost:8090"],
      ["BACKEND_BASE_URL", "http://localhost:8090/platform"],
      ["BACKEND_BASE_URL", "http://admin:password@localhost:8090"],
      ["FRONTEND_BASE_URL", "https://localhost:3000/store?id=1"],
      ["FRONTEND_BASE_URL", "ftp://localhost"],
      ["PAGE_BUILDER_PATH", "apps/page-builder-shell/"],
      ["REQUEST_TIMEOUT_MS", "0"],
      ["REQUEST_TIMEOUT_MS", "fast"],
      ["API_WORKERS", "0"],
      ["FRONTEND_WORKERS", "1.5"],
      ["VERIFY_SSL", "maybe"],
      ["RUN_DESTRUCTIVE_TESTS", "sometimes"],
      ["QUANTITY_CONTROL", "slider"],
      ["RANGE_FILTER_TYPE", "stepper"],
      ["CHECKOUT_MODE", "one-page"],
      ["SEED_ONLY", "   "],
    ] as const) {
      test(`rejects ${name}=${JSON.stringify(value)}`, () => {
        expect(() => parseEnv({ ...REQUIRED, [name]: value })).toThrow(name);
      });
    }

    for (const [value, expected] of [
      ["true", true],
      ["1", true],
      ["yes", true],
      ["ON", true],
      ["false", false],
      ["0", false],
      ["no", false],
      ["Off", false],
    ] as const) {
      test(`reads VERIFY_SSL=${value} as ${expected}`, () => {
        expect(parseEnv({ ...REQUIRED, VERIFY_SSL: value }).verifySsl).toBe(expected);
      });
    }
  });
});

test.describe("getEnv", () => {
  test("parses process.env once and returns the same configuration afterwards", () => {
    Object.assign(process.env, REQUIRED);

    const first = getEnv();
    const second = getEnv();

    expect(second).toBe(first);
    expect(first.storeId).toBe(process.env["STORE_ID"]);
  });
});
