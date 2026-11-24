import { defineConfig } from "@playwright/test";
import { isCi } from "@virtocommerce/test-automation-framework/core";

export default defineConfig({
  forbidOnly: isCi(),
  reporter: "list",
  projects: [
    {
      name: "unit",
      testDir: "tests/unit",
      testMatch: "**/*.test.ts",
      fullyParallel: true,
    },
  ],
});
