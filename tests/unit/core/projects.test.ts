import { expect, test } from "@playwright/test";

import { apiProject, e2eProject } from "@/core";

import { testEnv } from "./test-env.ts";

test.describe("projects", () => {
  const env = testEnv({ API_WORKERS: "6", E2E_WORKERS: "2" });

  test("limits an API project to API_WORKERS", () => {
    expect(apiProject(env, { name: "rest", testDir: "tests/rest" })).toEqual({
      name: "rest",
      testDir: "tests/rest",
      workers: 6,
    });
  });

  test("limits an end-to-end project to E2E_WORKERS", () => {
    expect(e2eProject(env, { name: "frontend" }).workers).toBe(2);
  });

  test("keeps the worker limit of the project", () => {
    expect(apiProject(env, { name: "serial", workers: 1 }).workers).toBe(1);
  });
});
