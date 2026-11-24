import { expect, test } from "@playwright/test";

import { DESTRUCTIVE_TAG, defaultRunOptions } from "@/core";

import { testEnv } from "./test-env.ts";

test.describe("defaultRunOptions", () => {
  let ci: string | undefined;

  test.beforeEach(() => {
    ci = process.env["CI"];
  });

  test.afterEach(() => {
    if (ci === undefined) {
      delete process.env["CI"];
    } else {
      process.env["CI"] = ci;
    }
  });

  test("does not retry failed tests", () => {
    expect(defaultRunOptions(testEnv()).retries).toBe(0);
  });

  test("uses the larger worker budget", () => {
    expect(defaultRunOptions(testEnv({ API_WORKERS: "6", E2E_WORKERS: "2" })).workers).toBe(6);
    expect(defaultRunOptions(testEnv({ API_WORKERS: "2", E2E_WORKERS: "5" })).workers).toBe(5);
  });

  test("forbids test.only on CI", () => {
    process.env["CI"] = "true";

    expect(defaultRunOptions(testEnv()).forbidOnly).toBe(true);
  });

  test("allows test.only outside CI", () => {
    delete process.env["CI"];

    expect(defaultRunOptions(testEnv()).forbidOnly).toBe(false);
  });

  test("leaves out destructive tests by default", () => {
    const filter = defaultRunOptions(testEnv()).grepInvert as RegExp;

    expect(filter.test(`deletes a store ${DESTRUCTIVE_TAG}`)).toBe(true);
    expect(filter.test(`deletes a store ${DESTRUCTIVE_TAG} @smoke`)).toBe(true);
    expect(filter.test(`deletes a store ${DESTRUCTIVE_TAG}-later`)).toBe(false);
    expect(filter.test(`deletes a store ${DESTRUCTIVE_TAG}ly`)).toBe(false);
    expect(filter.test("reads a store")).toBe(false);
  });

  test("runs destructive tests when RUN_DESTRUCTIVE_TESTS is on", () => {
    expect(defaultRunOptions(testEnv({ RUN_DESTRUCTIVE_TESTS: "true" }))).not.toHaveProperty("grepInvert");
  });
});
