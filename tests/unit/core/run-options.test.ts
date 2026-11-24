import { expect, test } from "@playwright/test";

import { DESTRUCTIVE_TAG, defaultRunOptions, PLATFORM_DEFECT_TAG } from "@/core";

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

  test("runs tests of known platform defects by default", () => {
    const filter = defaultRunOptions(testEnv()).grepInvert as RegExp;

    expect(filter.test(`searches apps ${PLATFORM_DEFECT_TAG}`)).toBe(false);
  });

  test("leaves out known platform defects and destructive tests when SKIP_PLATFORM_DEFECTS is on", () => {
    const filter = defaultRunOptions(testEnv({ SKIP_PLATFORM_DEFECTS: "true" })).grepInvert as RegExp;

    expect(filter.test(`searches apps ${PLATFORM_DEFECT_TAG}`)).toBe(true);
    expect(filter.test(`searches apps ${PLATFORM_DEFECT_TAG} @smoke`)).toBe(true);
    expect(filter.test(`searches apps ${PLATFORM_DEFECT_TAG}s`)).toBe(false);
    expect(filter.test(`deletes a store ${DESTRUCTIVE_TAG}`)).toBe(true);
    expect(filter.test("reads a store")).toBe(false);
  });

  test("leaves out only known platform defects when destructive tests may run", () => {
    const filter = defaultRunOptions(testEnv({ SKIP_PLATFORM_DEFECTS: "true", RUN_DESTRUCTIVE_TESTS: "true" }))
      .grepInvert as RegExp;

    expect(filter.test(`searches apps ${PLATFORM_DEFECT_TAG}`)).toBe(true);
    expect(filter.test(`deletes a store ${DESTRUCTIVE_TAG}`)).toBe(false);
  });
});
