import type { Vars } from "./browser-secrets.mts";

import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BROWSER_SECRETS_PATH,
  restrictToOwner,
  secretProblem,
  secretsFileText,
  tolerantRunVariables,
} from "./browser-secrets.mts";

/** The browser MCP server the agents use, pinned here and nowhere else. */
export const BROWSER_SERVER_PACKAGE = "@playwright/mcp@0.0.84";
const CLI_FILE_NAME = "browser-mcp.mts";
const PREPARE_ONLY = "--prepare-only";
const OWNER_ONLY = 0o600;
const WARNING = "warning:";
const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM"] as const;

/** What the launcher starts the server with: the secrets it can pass, the names it skipped, and why. */
export type Launch = {
  secrets: Record<string, string>;
  skipped: string[];
  warnings: string[];
  ignoreHttpsErrors: boolean;
};

/**
 * The secrets for the browser server: each password variable `passwordFor` names that is set in the run's variables
 * ({@link tolerantRunVariables}). A name that is unset, or whose value the secrets file cannot hold, is skipped with a
 * warning that never holds a value. `VERIFY_SSL=false` in the run's variables makes the browser accept a certificate it
 * cannot verify, as the suite does. Never throws: a launcher that stops leaves the agents with no browser at all.
 */
export function prepareLaunch(projectDir: string, shell: Vars = process.env): Launch {
  const { vars, names, warnings } = tolerantRunVariables(projectDir, shell);
  const secrets: Record<string, string> = {};
  const skipped: string[] = [];
  const all = [...warnings];
  for (const name of names) {
    const problem = secretProblem(name, vars);
    const value = vars[name];
    if (problem === undefined && value !== undefined) {
      secrets[name] = value;
    } else {
      skipped.push(name);
      all.push(`${problem ?? `${name} is not set`}: the agents cannot sign in with it`);
    }
  }
  return { secrets, skipped, warnings: all, ignoreHttpsErrors: vars["VERIFY_SSL"] === "false" };
}

/**
 * The arguments of `npx` that start the pinned server, with the secrets file only when it was written, and accepting a
 * certificate it cannot verify only when asked to.
 */
export function serverArguments(withSecrets: boolean, ignoreHttpsErrors = false): string[] {
  return [
    "-y",
    BROWSER_SERVER_PACKAGE,
    "--browser",
    "chromium",
    "--isolated",
    ...(withSecrets ? ["--secrets", BROWSER_SECRETS_PATH] : []),
    ...(ignoreHttpsErrors ? ["--ignore-https-errors"] : []),
  ];
}

function writeSecrets(projectDir: string, secrets: Readonly<Record<string, string>>, warnings: string[]): boolean {
  const filePath = join(projectDir, BROWSER_SECRETS_PATH);
  try {
    writeFileSync(filePath, secretsFileText(secrets), { mode: OWNER_ONLY });
  } catch {
    warnings.push(`${BROWSER_SECRETS_PATH} could not be written, so the server starts without the passwords`);
    return false;
  }
  let restricted: string;
  try {
    restricted = restrictToOwner(filePath);
  } catch {
    warnings.push(
      `${BROWSER_SECRETS_PATH} could not be restricted to its owner, so the server starts without the passwords`,
    );
    return false;
  }
  if (restricted.startsWith(WARNING)) {
    warnings.push(restricted.slice(WARNING.length).trim());
  }
  return true;
}

function removeStaleSecrets(projectDir: string, warnings: string[]): void {
  try {
    rmSync(join(projectDir, BROWSER_SECRETS_PATH), { force: true });
  } catch {
    warnings.push(`${BROWSER_SECRETS_PATH} from an earlier start could not be removed: delete it yourself`);
  }
}

function startServer(projectDir: string, withSecrets: boolean, ignoreHttpsErrors: boolean): void {
  const windows = process.platform === "win32";
  const args = serverArguments(withSecrets, ignoreHttpsErrors);
  const child = windows
    ? spawn(["npx.cmd", ...args].join(" "), { cwd: projectDir, stdio: "inherit", shell: true })
    : spawn("npx", args, { cwd: projectDir, stdio: "inherit" });
  for (const signal of FORWARDED_SIGNALS) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (error) => {
    process.stderr.write(`browser-mcp: the server did not start: ${error.message}\n`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    process.exit(code ?? (signal === null ? 0 : 1));
  });
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const { secrets, warnings, ignoreHttpsErrors } = prepareLaunch(projectDir);
  const withSecrets = Object.keys(secrets).length > 0 && writeSecrets(projectDir, secrets, warnings);
  if (!withSecrets) {
    removeStaleSecrets(projectDir, warnings);
  }
  for (const warning of warnings) {
    process.stderr.write(`browser-mcp: ${warning}\n`);
  }
  if (!process.argv.includes(PREPARE_ONLY)) {
    startServer(projectDir, withSecrets, ignoreHttpsErrors);
  }
}
