import { basename } from "node:path";

import { runVariables, signInStatus } from "./browser-secrets.mts";

const CLI_FILE_NAME = "stand.mts";
const ORIGINS = [
  ["frontend", "FRONTEND_BASE_URL"],
  ["backend", "BACKEND_BASE_URL"],
] as const;

export type StandOrigins = Record<(typeof ORIGINS)[number][0], string>;

/**
 * The origins of the stand the tests run against, from `FRONTEND_BASE_URL` and `BACKEND_BASE_URL` in the run's
 * variables (`runVariables`: the shell over `.env`). Only the origin of each is returned (scheme, host and port), never
 * a path, a query or user info, so the read-only agents learn where the stand is without reading `.env`. This is the
 * one exception to "never print `.env`": the origins and nothing else.
 *
 * @throws Error naming the variable that is unset or not an http or https address.
 */
export function standOrigins(vars: Readonly<Record<string, string | undefined>>): StandOrigins {
  const origins: Partial<StandOrigins> = {};
  for (const [name, variable] of ORIGINS) {
    const value = vars[variable] ?? "";
    const url = URL.parse(value);
    if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
      throw new Error(`stand: ${variable} is ${value === "" ? "not set" : "not an http or https address"}`);
    }
    origins[name] = url.origin;
  }
  return origins as StandOrigins;
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const projectDir = process.cwd();
    const origins = standOrigins(runVariables(projectDir));
    process.stdout.write(
      `frontend: ${origins.frontend}\nbackend: ${origins.backend}\nsign-in: ${signInStatus(projectDir)}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
