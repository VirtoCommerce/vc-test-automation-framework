import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { defaultReporters, MASKED, Secret } from "@/core";

test.describe("defaultReporters", () => {
  test("returns the list reporter and the Allure results in the output directory", () => {
    expect(defaultReporters({ outputDir: join("runs", "reports") })).toEqual([
      ["list"],
      ["allure-playwright", { resultsDir: join("runs", "reports", "allure-results"), environmentInfo: {} }],
    ]);
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
