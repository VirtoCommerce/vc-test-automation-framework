import type { ProjectFacts } from "./project-facts.mts";

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PLACEHOLDER_ACCOUNT_SUFFIX = "@your-company.test";
const PLACEHOLDER_PROJECT_KEY = /\bPROJ\b/;
const NPM_SCRIPT = /\bnpm\s+(?:run(?:-script)?\s+(?:-\S+\s+)*([^\s&|;"']+)|(test|t)(?![\w:-]))/g;
const PROJECT_FLAG = /--project(?:=|\s+)([^\s&|;"']+)/g;
const CONFIG_FILE = /^playwright\.config\.[cm]?[jt]s$/;
const COMMAND_ONLY_TEST_KEYS: readonly string[] = ["unit", "all"];
const TEST_SCRIPT = "test";

/** What the facts are checked against: the repository's `package.json` scripts, the suite's projects and its directories. */
export type SuiteWorld = {
  /** The script names of `package.json`, or `undefined` when the file is missing or unreadable. */
  scripts: ReadonlySet<string> | undefined;
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

function scriptsOf(text: string): string[] {
  return [...text.matchAll(NPM_SCRIPT)].map((match) => match[1] ?? TEST_SCRIPT);
}

function projectFlagsOf(text: string): string[] {
  return [...text.matchAll(PROJECT_FLAG)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

function scriptProblems(commands: readonly Command[], scripts: ReadonlySet<string> | undefined): string[] {
  const used = commands.flatMap((command) => scriptsOf(command.text).map((script) => ({ command, script })));
  if (used.length === 0) {
    return [];
  }
  if (scripts === undefined) {
    return ["commands run npm scripts, but package.json is missing or cannot be read"];
  }
  return used
    .filter(({ script }) => !scripts.has(script))
    .map(({ command, script }) => `${command.path} runs "npm run ${script}", which package.json does not define`);
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
 * Checks the facts against the repository: every `npm run` script a command names is in `package.json`; every key of
 * `commands.test` (except `unit` and `all`), every key of `quality.durationBudgetMs` and every `--project` a command
 * passes is a project of the suite's Playwright config; every `healerPaths` entry is an existing directory. What
 * could not be read is a note, not a problem.
 */
export function crossCheck(facts: ProjectFacts, world: SuiteWorld): Consistency {
  const commands = commandsOf(facts);
  const problems = scriptProblems(commands, world.scripts);
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
 */
export async function playwrightProjectNames(source: string): Promise<ReadonlySet<string> | string> {
  let program: unknown;
  try {
    const { parse } = await import("@babel/parser");
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

function readScripts(projectDir: string): ReadonlySet<string> | undefined {
  try {
    const manifest: unknown = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf8"));
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
 * Reads what {@link crossCheck} needs from the repository at `projectDir`: `package.json`, and the Playwright config
 * in the suite directory, which every suite has.
 */
export async function readSuiteWorld(projectDir: string, suiteDir: string): Promise<SuiteWorld> {
  const dir = join(projectDir, suiteDir);
  const config = existsSync(dir) ? readdirSync(dir).find((name) => CONFIG_FILE.test(name)) : undefined;
  const found = config === undefined ? "" : await playwrightProjectNames(readFileSync(join(dir, config), "utf8"));
  return {
    scripts: readScripts(projectDir),
    projects: typeof found === "string" ? undefined : found,
    projectsNote: typeof found === "string" ? found : "",
    hasConfig: config !== undefined,
    isDirectory: (path) => isDirectoryIn(projectDir, path),
  };
}
