import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseEnv } from "node:util";

const CLI_FILE_NAME = "stand.mts";
const ENV_FILE = ".env";
const ORIGINS = [
  ["frontend", "FRONTEND_BASE_URL"],
  ["backend", "BACKEND_BASE_URL"],
] as const;

export type StandOrigins = Record<(typeof ORIGINS)[number][0], string>;

/**
 * The origins of the stand the tests run against, from `FRONTEND_BASE_URL` and `BACKEND_BASE_URL`: a variable set in
 * the shell wins over the same one in `.env`, as in the test run. Only the origin of each is returned (scheme, host and
 * port), never a path, a query or user info, and no other variable is read, so the read-only agents can learn where
 * the stand is without reading `.env`.
 *
 * @throws Error naming the variable that is unset or not an http or https address.
 */
export function standOrigins(
  shell: Readonly<Record<string, string | undefined>>,
  envFile: Readonly<Record<string, string | undefined>>,
): StandOrigins {
  const origins: Partial<StandOrigins> = {};
  for (const [name, variable] of ORIGINS) {
    const value = shell[variable] || envFile[variable] || "";
    const url = URL.parse(value);
    if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
      throw new Error(`stand: ${variable} is ${value === "" ? "not set" : "not an http or https address"}`);
    }
    origins[name] = url.origin;
  }
  return origins as StandOrigins;
}

function readEnvFile(): Record<string, string | undefined> {
  return existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, "utf8")) : {};
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const origins = standOrigins(process.env, readEnvFile());
    process.stdout.write(`frontend: ${origins.frontend}\nbackend: ${origins.backend}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
