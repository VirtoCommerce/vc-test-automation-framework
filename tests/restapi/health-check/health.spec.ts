import * as allure from "allure-js-commons";

import { HealthClient } from "@api/rest/clients/health-client";
import { expect, test } from "@fixtures";

const PLATFORM_HEALTH_CHECKS = ["Background jobs", "Background jobs store", "Modules health", "Cache health"];
const DATABASE_HEALTH_CHECK = /^(PostgreSql|SqlServer|MySql) health$/;

test.beforeEach(async () => {
  await allure.feature("Health Check");
});

test.describe("health check (anonymous)", () => {
  test("get the health report", async ({ httpClient }) => {
    const healthClient = new HealthClient(httpClient);

    const report = await test.step("act: get health report", () => healthClient.getReport());

    await test.step("assert: report has the platform and database checks", async () => {
      const checks = Object.keys(report);
      expect(checks).toEqual(expect.arrayContaining(PLATFORM_HEALTH_CHECKS));
      expect(checks).toContainEqual(expect.stringMatching(DATABASE_HEALTH_CHECK));
    });
  });

  test("find no unhealthy health check", async ({ httpClient }) => {
    const healthClient = new HealthClient(httpClient);

    const report = await test.step("act: get health report", () => healthClient.getReport());

    await test.step("assert: every check is healthy or degraded", async () => {
      const unhealthy = Object.entries(report)
        .filter(([, check]) => check.Status === "Unhealthy")
        .map(([name, check]) => `${name}: ${check.Description}`);
      expect(unhealthy).toEqual([]);
    });
  });
});
