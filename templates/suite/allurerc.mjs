import { defineConfig } from "allure";

export default defineConfig({
  name: "Test suite",
  output: "reports/allure-report",
  plugins: {
    awesome: {
      options: {
        groupBy: ["parentSuite", "suite", "subSuite"],
      },
    },
  },
});
