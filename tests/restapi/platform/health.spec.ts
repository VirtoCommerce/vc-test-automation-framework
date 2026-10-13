import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

const PLATFORM_HEALTH_CHECKS = ["Background jobs", "Background jobs store", "Modules health", "Cache health"];
const DATABASE_HEALTH_CHECK = /^(postgre ?sql|sql ?server|my ?sql) health$/i;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Platform / Health");
});

test.describe("health check (anonymous)", () => {
  test("get the health report", {
    annotation: {
      type: "database difference",
      description: "The database check is named PostgreSql health, SQL Server health or MySql health.",
    },
  }, async ({ api }) => {
    await allure.story("Health");
    await allure.description(
      "The health report has the platform's checks and a database check, and none of them is unhealthy.",
    );

    const report = await test.step("act: get the health report", () => api.rest.health.getReport());

    await test.step("assert: the platform and database checks are reported", () => {
      const checks = Object.keys(report);
      expect(checks).toEqual(expect.arrayContaining(PLATFORM_HEALTH_CHECKS));
      expect(checks).toContainEqual(expect.stringMatching(DATABASE_HEALTH_CHECK));
    });
    await test.step("assert: no check is unhealthy", () => {
      expect(
        Object.entries(report)
          .filter(([, check]) => check.Status === "Unhealthy")
          .map(([name, check]) => `${name}: ${check.Description}`),
      ).toEqual([]);
    });
  });
});
