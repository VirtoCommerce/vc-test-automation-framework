import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseEnv } from "node:util";

import {
  PROJECT_FACTS_PATH,
  parseSuiteDir,
  ROOT_SUITE_DIR,
  readProjectFactsIn,
  suiteEnvPath,
} from "./project-facts.mts";

export const BROWSER_SECRETS_PATH = ".qa/browser-secrets.local.env";
const CLI_FILE_NAME = "browser-secrets.mts";
const OWNER_ONLY = 0o600;
const UNSAFE_VALUE = /['\r\n]/;

export type Vars = Readonly<Record<string, string | undefined>>;

type Run = (command: string, args: string[]) => unknown;

function envFileVariables(projectDir: string, suiteDir: string): Record<string, string | undefined> {
  const envPath = join(projectDir, suiteEnvPath(suiteDir));
  return existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
}

function underShell(
  fromFile: Readonly<Record<string, string | undefined>>,
  shell: Vars,
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...fromFile };
  for (const [name, value] of Object.entries(shell)) {
    if (value !== undefined && value !== "") {
      merged[name] = value;
    }
  }
  return merged;
}

/**
 * The variables of the run, as the tests see them: the suite's `.env` (`<suiteDir>/.env` of the project facts), and
 * one set in the shell wins over the same one there.
 *
 * @throws Error when the project facts cannot be read.
 */
export function runVariables(projectDir: string, shell: Vars = process.env): Record<string, string | undefined> {
  return underShell(envFileVariables(projectDir, readProjectFactsIn(projectDir).suiteDir), shell);
}

function tolerantSuiteVariables(
  projectDir: string,
  suiteDir: string,
  shell: Vars,
  warnings: string[],
): Record<string, string | undefined> {
  try {
    return underShell(envFileVariables(projectDir, suiteDir), shell);
  } catch {
    warnings.push(`${suiteEnvPath(suiteDir)} cannot be read, so only the shell's variables are used`);
    return underShell({}, shell);
  }
}

function tolerantSuiteDir(value: unknown, warnings: string[]): string {
  try {
    return parseSuiteDir(value);
  } catch {
    warnings.push(`${PROJECT_FACTS_PATH} has a suiteDir that is not a plain directory, so the root .env is used`);
    return ROOT_SUITE_DIR;
  }
}

/**
 * {@link runVariables} for a reader that must not stop: the project facts are read as plain JSON without validation,
 * so facts that still hold the template's examples work. Only `suiteDir` (a string, else `"."`) and the string values
 * of `passwordFor` are taken. Facts that cannot be read give a warning, the root `.env` and no password name.
 */
export function tolerantRunVariables(
  projectDir: string,
  shell: Vars = process.env,
): { vars: Record<string, string | undefined>; names: string[]; warnings: string[] } {
  const warnings: string[] = [];
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(join(projectDir, PROJECT_FACTS_PATH), "utf8"));
  } catch (error) {
    const reason = error instanceof SyntaxError ? "is not valid JSON" : "cannot be read";
    warnings.push(`${PROJECT_FACTS_PATH} ${reason}, so no password is passed to the browser server`);
    return { vars: tolerantSuiteVariables(projectDir, ROOT_SUITE_DIR, shell, warnings), names: [], warnings };
  }
  const facts = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
  const suiteDir = tolerantSuiteDir(facts["suiteDir"], warnings);
  const passwordFor =
    typeof facts["passwordFor"] === "object" && facts["passwordFor"] !== null ? facts["passwordFor"] : {};
  const names = passwordNames(
    Object.fromEntries(
      Object.entries(passwordFor).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ),
  );
  return { vars: tolerantSuiteVariables(projectDir, suiteDir, shell, warnings), names, warnings };
}

/** The distinct variable names `passwordFor` lists, sorted. */
export function passwordNames(passwordFor: Readonly<Record<string, string>> | undefined): string[] {
  return [...new Set(Object.values(passwordFor ?? {}))].sort();
}

/**
 * Why the secrets file cannot hold the variable `name` of the run's variables, without its value: it is unset, or it
 * holds a quote or a line break.
 *
 * @returns the reason, or `undefined` when the file can hold it.
 */
export function secretProblem(name: string, vars: Vars): string | undefined {
  const value = vars[name];
  if (value === undefined || value === "") {
    return `${name} is not set in the suite's .env or the shell`;
  }
  if (UNSAFE_VALUE.test(value)) {
    return `${name} holds a quote or a line break, which the secrets file cannot hold`;
  }
  return undefined;
}

/**
 * The browser server's secrets: each password variable `passwordFor` names, with its value from the run's variables.
 *
 * @throws Error naming a variable that is unset or that holds a quote or a line break (the file could not hold it).
 */
export function browserSecrets(names: readonly string[], vars: Vars): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => {
      const problem = secretProblem(name, vars);
      if (problem !== undefined) {
        throw new Error(`browser-secrets: ${problem}`);
      }
      return [name, vars[name] ?? ""];
    }),
  );
}

function runQuietly(command: string, args: string[]): unknown {
  return execFileSync(command, args, { stdio: "ignore", windowsHide: true });
}

/**
 * Restricts the secrets file to the current user and says what it did. Mode 0600 does that on POSIX; Windows ignores
 * the mode, so there the file's access list is replaced with `icacls`: inheritance removed, full control for the
 * current user only.
 *
 * @returns `"mode 0600"`, `"icacls"`, or a warning (starting `"warning:"`) when the file may be readable by other
 * accounts of the computer, because `icacls` is not available or failed.
 */
export function restrictToOwner(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
  vars: Vars = process.env,
  run: Run = runQuietly,
): string {
  chmodSync(filePath, OWNER_ONLY);
  if (platform !== "win32") {
    return "mode 0600";
  }
  const user = vars["USERNAME"];
  if (user === undefined || user === "") {
    return "warning: on Windows the file mode is ignored and USERNAME is not set, so the file could not be restricted: remove other accounts' access to it yourself";
  }
  const domain = vars["USERDOMAIN"];
  const account = domain === undefined || domain === "" ? user : `${domain}\\${user}`;
  try {
    run("icacls", [filePath, "/inheritance:r", "/grant:r", `${account}:F`]);
    return "icacls";
  } catch {
    return "warning: on Windows the file mode is ignored and icacls failed, so other accounts of this computer may be able to read the file: remove their access to it yourself";
  }
}

/** The secrets file's text: one `NAME='value'` line each. */
export function secretsFileText(secrets: Readonly<Record<string, string>>): string {
  return Object.entries(secrets)
    .map(([name, value]) => `${name}='${value}'\n`)
    .join("");
}

/**
 * Whether an agent can sign in as a role in the browser: `ready` when every password variable `passwordFor` names is
 * set in the run's variables, otherwise the unset ones, without printing a value. The browser server reads them when it
 * starts, so a change applies after it restarts.
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
  const vars = runVariables(projectDir, shell);
  const problems = names.flatMap((name) => secretProblem(name, vars) ?? []);
  return problems.length > 0 ? `not available (${problems.join("; ")})` : "ready";
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const projectDir = process.cwd();
    const names = passwordNames(readProjectFactsIn(projectDir).passwordFor);
    const secrets = browserSecrets(names, runVariables(projectDir));
    const filePath = join(projectDir, BROWSER_SECRETS_PATH);
    writeFileSync(filePath, secretsFileText(secrets), { mode: OWNER_ONLY });
    const restricted = restrictToOwner(filePath);
    const warning = restricted.startsWith("warning:");
    process.stdout.write(
      `browser-secrets: wrote ${BROWSER_SECRETS_PATH} with ${names.length === 0 ? "no variable (no passwordFor)" : names.join(", ")}${warning ? "" : ` (owner only, by ${restricted})`}; restart the browser server to use it\n`,
    );
    if (warning) {
      process.stderr.write(`browser-secrets: ${restricted}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
