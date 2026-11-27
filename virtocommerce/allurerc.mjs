import { defineConfig } from "allure";

export default defineConfig({
  name: "Virto Commerce test suite",
  output: "reports/allure-report",
  plugins: {
    awesome: {
      options: {
        groupBy: ["parentSuite", "suite", "subSuite"],
      },
    },
  },
});
