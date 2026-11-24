import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseEnv } from "node:util";

import { readProjectFactsIn, suiteEnvPath } from "./project-facts.mts";

export const BROWSER_SECRETS_PATH = ".qa/browser-secrets.local.env";
const CLI_FILE_NAME = "browser-secrets.mts";
const OWNER_ONLY = 0o600;
const UNSAFE_VALUE = /['\r\n]/;

type Vars = Readonly<Record<string, string | undefined>>;

/**
 * The variables of the run, as the tests see them: the suite's `.env` (`<suiteDir>/.env` of the project facts), and
 * one set in the shell wins over the same one there.
 *
 * @throws Error when the project facts cannot be read.
 */
export function runVariables(projectDir: string, shell: Vars = process.env): Record<string, string | undefined> {
  const envPath = join(projectDir, suiteEnvPath(readProjectFactsIn(projectDir).suiteDir));
  const fromFile = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
  const merged: Record<string, string | undefined> = { ...fromFile };
  for (const [name, value] of Object.entries(shell)) {
    if (value !== undefined && value !== "") {
      merged[name] = value;
    }
  }
  return merged;
}

/** The distinct variable names `passwordFor` lists, sorted. */
export function passwordNames(passwordFor: Readonly<Record<string, string>> | undefined): string[] {
  return [...new Set(Object.values(passwordFor ?? {}))].sort();
}

/**
 * The browser server's secrets: each password variable `passwordFor` names, with its value from the run's variables.
 *
 * @throws Error naming a variable that is unset or that holds a quote or a line break (the file could not hold it).
 */
export function browserSecrets(names: readonly string[], vars: Vars): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => {
      const value = vars[name];
      if (value === undefined || value === "") {
        throw new Error(`browser-secrets: ${name} is not set in the suite's .env or the shell`);
      }
      if (UNSAFE_VALUE.test(value)) {
        throw new Error(`browser-secrets: ${name} holds a quote or a line break, which the secrets file cannot hold`);
      }
      return [name, value];
    }),
  );
}

/** The secrets file's text: one `NAME='value'` line each. */
export function secretsFileText(secrets: Readonly<Record<string, string>>): string {
  return Object.entries(secrets)
    .map(([name, value]) => `${name}='${value}'\n`)
    .join("");
}

/**
 * Whether an agent can sign in as a role in the browser: `ready`, or why not. Compares the secrets file with the run's
 * variables without printing a value. The browser server reads the file when it starts, so a file written later
 * counts only after the server restarts.
 */
export function signInStatus(projectDir: string, shell: Vars = process.env): string {
  let names: string[];
  try {
    names = passwordNames(readProjectFactsIn(projectDir).passwordFor);
  } catch (error) {
    return `not available (${error instanceof Error ? error.message : String(error)})`;
  }
  if (names.length === 0) {
    return "not available (the project facts have no passwordFor)";
  }
  const filePath = join(projectDir, BROWSER_SECRETS_PATH);
  if (!existsSync(filePath)) {
    return `not available (${BROWSER_SECRETS_PATH} is missing: run node .claude/checks/browser-secrets.mts)`;
  }
  const inFile = parseEnv(readFileSync(filePath, "utf8"));
  const vars = runVariables(projectDir, shell);
  const stale = names.filter((name) => vars[name] === undefined || vars[name] === "" || inFile[name] !== vars[name]);
  if (stale.length > 0) {
    return `not available (${BROWSER_SECRETS_PATH} does not match ${stale.join(", ")}: run node .claude/checks/browser-secrets.mts and restart the browser server)`;
  }
  return "ready";
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const projectDir = process.cwd();
    const names = passwordNames(readProjectFactsIn(projectDir).passwordFor);
    const secrets = browserSecrets(names, runVariables(projectDir));
    const filePath = join(projectDir, BROWSER_SECRETS_PATH);
    writeFileSync(filePath, secretsFileText(secrets), { mode: OWNER_ONLY });
    chmodSync(filePath, OWNER_ONLY);
    process.stdout.write(
      `browser-secrets: wrote ${BROWSER_SECRETS_PATH} with ${names.length === 0 ? "no variable (no passwordFor)" : names.join(", ")}; restart the browser server to use it\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
