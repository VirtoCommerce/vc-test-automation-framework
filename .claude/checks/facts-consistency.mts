import type { ProjectFacts } from "./project-facts.mts";

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const PLACEHOLDER_ACCOUNT_SUFFIX = "@your-company.test";
const PLACEHOLDER_PROJECT_KEY = /\bPROJ\b/;
const COMMAND_SEPARATOR = /[;&|]+/;
const QUOTES = /["']/g;
const PREFIX_FLAGS = ["--prefix", "-C"];
const PREFIX_ASSIGNMENT = "--prefix=";
const RUN_COMMANDS = ["run", "run-script"];
const TEST_COMMANDS = ["test", "t"];
const PACKAGE_FILE = "package.json";
const ROOT_DIR = ".";
const PROJECT_FLAG = /--project(?:=|\s+)([^\s&|;"']+)/g;
const CONFIG_FILE = /^playwright\.config\.[cm]?[jt]s$/;
const COMMAND_ONLY_TEST_KEYS: readonly string[] = ["unit", "all"];
const TEST_SCRIPT = "test";

export type BabelParser = typeof import("@babel/parser");

/** What the facts are checked against: the `package.json` scripts, the suite's projects and its directories. */
export type SuiteWorld = {
  /**
   * The directory, relative to the repository root, whose `package.json` an `npm` command without `--prefix` runs:
   * the suite directory when the suite is its own npm project, else the root (`.`).
   */
  packageDir: string;
  /** The script names of `<dir>/package.json`, or `undefined` when the file is missing or unreadable. */
  scripts: (dir: string) => ReadonlySet<string> | undefined;
  /** The Playwright project names the suite's config defines, or `undefined` when they could not be read. */
  projects: ReadonlySet<string> | undefined;
  /** Why `projects` is `undefined`, or an empty text. */
  projectsNote: string;
  /** Whether the suite directory holds a Playwright config. */
  hasConfig: boolean;
  /** Whether a repository-relative path is a directory. */
  isDirectory: (path: string) => boolean;
};

export type Consistency = { problems: string[]; notes: string[] };

type Command = { path: string; text: string };

type NpmRun = { script: string; prefix: string | undefined };

/** How {@link readSuiteWorld} reads the suite: the directory of its `package.json` and the import of `@babel/parser`. */
export type SuiteWorldOptions = { packageDir?: string; loadParser?: () => Promise<BabelParser> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Lists the values of the facts that are still the template's examples: a role account in the example domain and the
 * example `PROJ` tracker key. They are what `.qa/project.example.json` and the suite template write; an agent that
 * plans against them plans against a tracker and accounts that do not exist.
 */
export function placeholderProblems(facts: ProjectFacts): string[] {
  const problems = Object.entries(facts.roles)
    .filter(([, account]) => account.toLowerCase().endsWith(PLACEHOLDER_ACCOUNT_SUFFIX))
    .map(
      ([role]) =>
        `roles["${role}"] is the template's example account: replace it with an account of this repository's stand`,
    );
  if (PLACEHOLDER_PROJECT_KEY.test(facts.tracker.keyPattern)) {
    problems.push(
      "tracker.keyPattern is the template's example key pattern (PROJ): replace it with this tracker's project key",
    );
  }
  return problems;
}

function commandsOf(facts: ProjectFacts): Command[] {
  const { typecheck, lint, seed, test } = facts.commands;
  return [
    { path: "commands.typecheck", text: typecheck },
    ...(lint === undefined ? [] : [{ path: "commands.lint", text: lint }]),
    ...(seed === undefined ? [] : [{ path: "commands.seed", text: seed }]),
    ...Object.entries(test).map(([project, text]) => ({ path: `commands.test["${project}"]`, text })),
  ];
}

function prefixDir(dir: string): string {
  const plain = dir.replace(/^(\.\/)+/, "").replace(/\/+$/, "");
  return plain === "" ? ROOT_DIR : plain;
}

/**
 * The npm scripts a command runs: `npm run <script>` (or `run-script`, flags before the script allowed) and `npm test`,
 * each with the directory of a `--prefix <dir>`, `--prefix=<dir>` or `-C <dir>` before or after the script (not
 * after `--`, which passes it to the script).
 */
function npmRunsOf(text: string): NpmRun[] {
  const runs: NpmRun[] = [];
  for (const segment of text.split(COMMAND_SEPARATOR)) {
    const words = segment.replace(QUOTES, "").trim().split(/\s+/);
    const start = words.indexOf("npm");
    if (start < 0) {
      continue;
    }
    const rest = words.slice(start + 1);
    const end = rest.indexOf("--");
    const own = end < 0 ? rest : rest.slice(0, end);
    let prefix: string | undefined;
    const positional: string[] = [];
    for (let index = 0; index < own.length; index += 1) {
      const word = own[index] ?? "";
      if (PREFIX_FLAGS.includes(word)) {
        index += 1;
        const dir = own[index];
        prefix = dir === undefined ? prefix : prefixDir(dir);
      } else if (word.startsWith(PREFIX_ASSIGNMENT)) {
        prefix = prefixDir(word.slice(PREFIX_ASSIGNMENT.length));
      } else if (!word.startsWith("-")) {
        positional.push(word);
      }
    }
    const [command = "", script] = positional;
    if (RUN_COMMANDS.includes(command) && script !== undefined) {
      runs.push({ script, prefix });
    } else if (TEST_COMMANDS.includes(command)) {
      runs.push({ script: TEST_SCRIPT, prefix });
    }
  }
  return runs;
}

function packageFileOf(dir: string): string {
  return dir === ROOT_DIR ? PACKAGE_FILE : `${dir}/${PACKAGE_FILE}`;
}

function projectFlagsOf(text: string): string[] {
  return [...text.matchAll(PROJECT_FLAG)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

function scriptProblems(commands: readonly Command[], world: SuiteWorld): string[] {
  const used = commands.flatMap((command) =>
    npmRunsOf(command.text).map(({ script, prefix }) => ({ command, script, dir: prefix ?? world.packageDir })),
  );
  return [...new Set(used.map(({ dir }) => dir))].flatMap((dir) => {
    const scripts = world.scripts(dir);
    const file = packageFileOf(dir);
    if (scripts === undefined) {
      return [`commands run npm scripts, but ${file} is missing or cannot be read`];
    }
    return used
      .filter((run) => run.dir === dir && !scripts.has(run.script))
      .map(({ command, script }) => `${command.path} runs "npm run ${script}", which ${file} does not define`);
  });
}

function projectProblems(facts: ProjectFacts, commands: readonly Command[], projects: ReadonlySet<string>): string[] {
  const known = [...projects].join(", ");
  const problems: string[] = [];
  for (const key of Object.keys(facts.commands.test)) {
    if (!(COMMAND_ONLY_TEST_KEYS.includes(key) || projects.has(key))) {
      problems.push(`commands.test["${key}"] is not a project of the suite's Playwright config (${known})`);
    }
  }
  for (const key of Object.keys(facts.quality.durationBudgetMs)) {
    if (!projects.has(key)) {
      problems.push(`quality.durationBudgetMs["${key}"] is not a project of the suite's Playwright config (${known})`);
    }
  }
  for (const command of commands) {
    for (const flag of projectFlagsOf(command.text)) {
      if (!projects.has(flag)) {
        problems.push(`${command.path} runs --project=${flag}, which the suite's Playwright config does not define`);
      }
    }
  }
  return problems;
}

/**
 * Checks the facts against the repository: every `npm run` script a command names is in the `package.json` it runs
 * against (of its `--prefix` directory, else of the suite when it is its own npm project, else of the root); every key of
 * `commands.test` (except `unit` and `all`), every key of `quality.durationBudgetMs` and every `--project` a command
 * passes is a project of the suite's Playwright config; every `healerPaths` entry is an existing directory. What
 * could not be read is a note, not a problem.
 */
export function crossCheck(facts: ProjectFacts, world: SuiteWorld): Consistency {
  const commands = commandsOf(facts);
  const problems = scriptProblems(commands, world);
  const notes: string[] = [];
  if (!world.hasConfig) {
    problems.push(`suiteDir "${facts.suiteDir}" holds no playwright.config`);
  } else if (world.projects === undefined) {
    notes.push(`the suite's projects were not checked: ${world.projectsNote}`);
  } else {
    problems.push(...projectProblems(facts, commands, world.projects));
  }
  facts.healerPaths.forEach((path, index) => {
    if (!world.isDirectory(path)) {
      problems.push(
        `healerPaths[${index}] "${path}" is not a directory of the repository: create it or remove the entry`,
      );
    }
  });
  return { problems, notes };
}

function visit(node: unknown, found: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      visit(child, found);
    }
  } else if (isRecord(node)) {
    found(node);
    for (const child of Object.values(node)) {
      visit(child, found);
    }
  }
}

function keyName(node: unknown): string | undefined {
  if (!isRecord(node)) {
    return undefined;
  }
  if (node["type"] === "Identifier" && typeof node["name"] === "string") {
    return node["name"];
  }
  return node["type"] === "StringLiteral" && typeof node["value"] === "string" ? node["value"] : undefined;
}

function nameIn(object: unknown): string | undefined {
  if (!isRecord(object) || object["type"] !== "ObjectExpression" || !Array.isArray(object["properties"])) {
    return undefined;
  }
  for (const property of object["properties"]) {
    if (isRecord(property) && property["type"] === "ObjectProperty" && keyName(property["key"]) === "name") {
      const value = property["value"];
      return isRecord(value) && value["type"] === "StringLiteral" && typeof value["value"] === "string"
        ? value["value"]
        : undefined;
    }
  }
  return undefined;
}

function projectName(element: unknown): string | undefined {
  if (!isRecord(element)) {
    return undefined;
  }
  if (element["type"] === "ObjectExpression") {
    return nameIn(element);
  }
  if (element["type"] === "CallExpression" && Array.isArray(element["arguments"])) {
    return element["arguments"].map(nameIn).find((name) => name !== undefined);
  }
  return undefined;
}

/**
 * The project names of a Playwright config's source: the `name` of each entry of its `projects` list, an object or a
 * call (such as `apiProject(env, { name: "restapi" })`) with an object argument that has a literal `name`. A text, not
 * a set, says why the names could not be read: `@babel/parser` is missing, the source cannot be parsed, there is not
 * exactly one `projects` list, or an entry has no literal name.
 *
 * @param loadParser imports `@babel/parser`; by default as the checks resolve it.
 */
export async function playwrightProjectNames(
  source: string,
  loadParser: () => Promise<BabelParser> = () => import("@babel/parser"),
): Promise<ReadonlySet<string> | string> {
  let program: unknown;
  try {
    const { parse } = await loadParser();
    program = parse(source, { sourceType: "module", plugins: ["typescript"] }).program;
  } catch (error) {
    const missing = error instanceof Error && "code" in error && error.code === "ERR_MODULE_NOT_FOUND";
    return missing ? "@babel/parser is not installed" : "the Playwright config cannot be parsed";
  }
  const lists: unknown[][] = [];
  visit(program, (node) => {
    const list = node["value"];
    if (
      node["type"] === "ObjectProperty" &&
      keyName(node["key"]) === "projects" &&
      isRecord(list) &&
      list["type"] === "ArrayExpression" &&
      Array.isArray(list["elements"])
    ) {
      lists.push(list["elements"]);
    }
  });
  const [only, ...others] = lists;
  if (only === undefined || others.length > 0) {
    return "the Playwright config has no single `projects` list";
  }
  const names = only.map(projectName);
  return names.every((name) => name !== undefined)
    ? new Set(names.filter((name) => name !== undefined))
    : "an entry of the `projects` list has no literal name";
}

function readScripts(projectDir: string, dir: string): ReadonlySet<string> | undefined {
  try {
    const manifest: unknown = JSON.parse(readFileSync(resolve(projectDir, dir, PACKAGE_FILE), "utf8"));
    const scripts = isRecord(manifest) ? manifest["scripts"] : undefined;
    return new Set(isRecord(scripts) ? Object.keys(scripts) : []);
  } catch {
    return undefined;
  }
}

function isDirectoryIn(projectDir: string, path: string): boolean {
  const full = join(projectDir, path);
  return existsSync(full) && statSync(full).isDirectory();
}

/**
 * Reads what {@link crossCheck} needs from the repository at `projectDir`: the `package.json` files, and the
 * Playwright config in the suite directory, which every suite has.
 */
export async function readSuiteWorld(
  projectDir: string,
  suiteDir: string,
  { packageDir = ROOT_DIR, loadParser }: SuiteWorldOptions = {},
): Promise<SuiteWorld> {
  const dir = join(projectDir, suiteDir);
  const config = existsSync(dir) ? readdirSync(dir).find((name) => CONFIG_FILE.test(name)) : undefined;
  const source = config === undefined ? "" : readFileSync(join(dir, config), "utf8");
  const found = config === undefined ? "" : await playwrightProjectNames(source, loadParser);
  return {
    packageDir,
    scripts: (scriptDir) => readScripts(projectDir, scriptDir),
    projects: typeof found === "string" ? undefined : found,
    projectsNote: typeof found === "string" ? found : "",
    hasConfig: config !== undefined,
    isDirectory: (path) => isDirectoryIn(projectDir, path),
  };
}
