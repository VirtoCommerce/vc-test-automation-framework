import type { Project } from "@playwright/test";
import type { Env } from "./env.ts";

/**
 * Returns a project of API tests, such as REST and GraphQL tests, limited to `API_WORKERS` workers.
 *
 * @example
 * apiProject(env, { name: "rest", testDir: "tests/rest", dependencies: ["seed"] }),
 *
 * @param env - The parsed environment variables.
 * @param project - The project. Its own `workers` replaces the limit.
 * @returns The project with its worker limit.
 */
export function apiProject<TTestArgs, TWorkerArgs>(
  env: Env,
  project: Project<TTestArgs, TWorkerArgs>,
): Project<TTestArgs, TWorkerArgs> {
  return {
    workers: env.API_WORKERS,
    ...project,
  };
}

/**
 * Returns a project of end-to-end browser tests, limited to `E2E_WORKERS` workers.
 *
 * @example
 * e2eProject(env, { name: "frontend", testDir: "tests/e2e/frontend", use: { ...devices["Desktop Chrome"] } }),
 *
 * @param env - The parsed environment variables.
 * @param project - The project. Its own `workers` replaces the limit.
 * @returns The project with its worker limit.
 */
export function e2eProject<TTestArgs, TWorkerArgs>(
  env: Env,
  project: Project<TTestArgs, TWorkerArgs>,
): Project<TTestArgs, TWorkerArgs> {
  return {
    workers: env.E2E_WORKERS,
    ...project,
  };
}
