import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { expect, test } from "@fixtures";
import { MODULES } from "@modules";

const PLATFORM_HEALTH_CHECKS = ["Modules health", "Cache health"];
const BACKGROUND_JOBS_HEALTH_CHECKS = ["Background jobs", "Background jobs store"];
const DATABASE_HEALTH_CHECK = /^(postgre ?sql|sql ?server|my ?sql) health$/i;

type HealthReport = Readonly<Record<string, { readonly Status?: string; readonly Description?: string | null }>>;

test.describe("health check (anonymous)", () => {
  test("get the health report", {
    annotation: {
      type: "database difference",
      description: "The database check is named PostgreSql health, SQL Server health or MySql health.",
    },
  }, async ({ api }) => {
    const report = await test.step("act: get the health report", () => healthReport(api));

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

test.describe("background jobs health (anonymous)", () => {
  test.use({ modules: { backgroundJobs: MODULES.backgroundJobs } });

  test("report the background jobs engine and its store", async ({ api }) => {
    const report = await test.step("act: get the health report", () => healthReport(api));

    await test.step("assert: the background jobs checks are reported", () => {
      expect(Object.keys(report)).toEqual(expect.arrayContaining(BACKGROUND_JOBS_HEALTH_CHECKS));
    });
  });
});

async function healthReport(api: HttpClient): Promise<HealthReport> {
  return (await api.get("/health")).json<HealthReport>();
}
