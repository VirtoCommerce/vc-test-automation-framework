import { existsSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { defaultReporters, MASKED, Secret } from "@/core";

test.describe("defaultReporters", () => {
  test("returns the list reporter, the Allure results in the output directory and the masking of the results", () => {
    const resultsDir = join("runs", "reports", "allure-results");

    expect(defaultReporters({ outputDir: join("runs", "reports") })).toEqual([
      ["list"],
      ["allure-playwright", { resultsDir, environmentInfo: {} }],
      [expect.stringMatching(/secret-masking-reporter.(ts|js)$/), { dirs: [resultsDir] }],
    ]);
  });

  test("points the masking reporter at a module that exists", () => {
    const [, , [path] = []] = defaultReporters({ outputDir: "reports" });

    expect(existsSync(String(path))).toBe(true);
  });

  test("passes the environment to the report", () => {
    const [, report] = defaultReporters({
      outputDir: "reports",
      environment: { backend: "https://platform.example.com", store: "B2B-store" },
    });

    expect(report).toEqual([
      "allure-playwright",
      expect.objectContaining({ environmentInfo: { backend: "https://platform.example.com", store: "B2B-store" } }),
    ]);
  });

  test("masks registered secrets in the environment", () => {
    const password = Secret.of("reporter-password-12345");

    const [, report] = defaultReporters({
      outputDir: "reports",
      environment: { note: `signed in with ${password.reveal()}` },
    });

    expect(report).toEqual([
      "allure-playwright",
      expect.objectContaining({ environmentInfo: { note: `signed in with ${MASKED}` } }),
    ]);
  });
});
