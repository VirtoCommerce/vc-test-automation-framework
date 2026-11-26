#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { checkGivenValues, resolveAnswers } from "./lib/answers.mjs";
import { parseArguments } from "./lib/arguments.mjs";
import { browserServerKind, LAUNCHER_SNIPPET } from "./lib/browser-server.mjs";
import { dependencySpecs, suiteOverrides, withOverrides } from "./lib/dependencies.mjs";
import { createPrompter, isInteractive } from "./lib/prompts.mjs";
import { formatTable, runReadiness } from "./lib/readiness.mjs";
import { discardOnFailure, removeIfCreated, writeAnswers } from "./lib/suite-files.mjs";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_DIRS = ["agents", "commands", "skills", "checks", "hooks"];
const AGENTS_ROOT = ".claude";
const MANIFEST_FILE = ".claude/.vc-qa-agents.json";
const AGENT_PATH = new RegExp(`^\\.claude/(${AGENT_DIRS.join("|")})/[^/]+(/[^/]+)*$`);
const RENAMED_DIRS = ["agents", "commands", "skills"];
const NAME_PREFIX = "vc-";
const FORCE_OURS = "--force-ours";
const USAGE = [
  "Usage:",
  "  npx vc-qa-agents [--force-ours]           install the QA agents into .claude/",
  "  npx vc-qa-agents init [<suite directory>] [--skip-install] [--force-ours] [--yes] [--save-passwords]",
  "      [--skip-verify] [--backend-url <url>] [--frontend-url <url>] [--store-id <id>] [--admin-login <login>]",
  "      [--customer <email>] [--other-customer <email>] [--tracker <name>] [--key-pattern <pattern>]",
  "      [--docs <url | mcp:server | text>] [--test-id-attribute <attribute>]",
  "                                            write a test suite (into the directory, if given), with the agents,",
  "                                            ask for what it needs and check that it is ready",
  "  npx vc-qa-agents doctor [--skip-verify]   check again that the suite is ready",
  "  npx vc-qa-agents uninstall                remove the files of the QA agents that are unchanged since install",
].join("\n");
const HOOK_SCRIPT = ".claude/hooks/readonly-shell.mts";
const GUARD_FILES = [HOOK_SCRIPT, ".claude/checks/readonly-shell.mts"];
const MCP_FILE = ".mcp.json";
const BROWSER_SERVER = "playwright";
const FACTS_FILE = ".qa/project.json";
const FACTS_CHECK = ".claude/checks/project-facts.mts";
const CANCELLED = "cancelled";
const NO_TERMINAL = "No terminal: nothing was asked; pass the values as flags or edit .env.";
const ROOT_DIR = ".";
const QA_DIR = ".qa/";
const SUITE_DIR = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)*$/;
const NPM = "npm ";
const NPX_PLAYWRIGHT = "npx playwright test";
const GITIGNORE_LINES = [
  ".qa/contracts/",
  ".qa/runs/",
  ".qa/reports/",
  ".qa/kb/",
  ".qa/probes/",
  ".qa/judge/",
  ".qa/*.local.env",
  ".qa/client-terms.local.txt",
  ".playwright-mcp/",
];

function filesUnder(dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

function packageFiles() {
  return AGENT_DIRS.flatMap((dir) => filesUnder(join(PACKAGE_ROOT, AGENTS_ROOT, dir)))
    .map((path) => relative(PACKAGE_ROOT, path).split(sep).join("/"))
    .sort();
}

function hashOf(path) {
  return createHash("sha256").update(readFileSync(path, "utf8").replaceAll("\r\n", "\n")).digest("hex");
}

function packageIdentity() {
  const { name, version } = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
  return { name, version };
}

function readManifest(target) {
  const path = join(target, MANIFEST_FILE);
  if (!existsSync(path)) {
    return null;
  }
  const invalid = new Error(
    `${MANIFEST_FILE} is not the list of files vc-qa-agents installed: restore it from git, or delete it and run ` +
      "vc-qa-agents again, which then takes as its own only the files equal to the package's.",
  );
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw invalid;
  }
  const files = manifest?.files;
  if (typeof files !== "object" || files === null || Array.isArray(files)) {
    throw invalid;
  }
  for (const [file, hash] of Object.entries(files)) {
    if (!AGENT_PATH.test(file) || file.split("/").includes("..") || !/^[0-9a-f]{64}$/.test(String(hash))) {
      throw invalid;
    }
  }
  return { files };
}

function writeManifest(target, files) {
  const { name, version } = packageIdentity();
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)));
  mkdirSync(join(target, AGENTS_ROOT), { recursive: true });
  writeFileSync(join(target, MANIFEST_FILE), `${JSON.stringify({ package: name, version, files: sorted }, null, 2)}\n`);
}

function copyFile(target, path) {
  const destination = join(target, path);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(join(PACKAGE_ROOT, path), destination);
}

function removeFile(target, path) {
  rmSync(join(target, path));
  const stop = join(target, AGENTS_ROOT);
  let dir = dirname(join(target, path));
  while (dir !== stop && readdirSync(dir).length === 0) {
    rmdirSync(dir);
    dir = dirname(dir);
  }
}

function notOursLine(path, hasManifest) {
  return hasManifest
    ? `Kept ${path}: it belongs to this repository, so the package's file of that name is not installed; ` +
        "rename yours and run vc-qa-agents again to have both."
    : `Kept ${path}: it differs from the package's file and nothing records it as the package's; if it is a copy ` +
        "from an earlier version, delete it and run vc-qa-agents again, and if it is yours, rename it to have both.";
}

function earlierEntryOf(path) {
  const [root, dir, name, ...rest] = path.split("/");
  if (!RENAMED_DIRS.includes(dir) || !name.startsWith(NAME_PREFIX)) {
    return undefined;
  }
  return [root, dir, name.slice(NAME_PREFIX.length)].join("/") + (rest.length > 0 ? "/" : "");
}

function laterNameOf(path, shipped) {
  const [root, dir, name, ...rest] = path.split("/");
  const later = [root, dir, `${NAME_PREFIX}${name}`, ...rest].join("/");
  return RENAMED_DIRS.includes(dir) && shipped.includes(later) ? later : undefined;
}

function earlierNameLines(target, shipped) {
  const entries = [
    ...new Set(shipped.map(earlierEntryOf).filter((entry) => entry !== undefined && existsSync(join(target, entry)))),
  ];
  if (entries.length === 0) {
    return [];
  }
  return [
    `Kept ${entries.length} agents, commands and skills under the names they had before the ${NAME_PREFIX} prefix, which ` +
      `nothing records as the package's: ${entries.join(", ")}. The package ships each as ${NAME_PREFIX}<name>; delete ` +
      "the ones that are copies of an earlier version, and keep yours.",
  ];
}

function guardLines(target) {
  const differing = GUARD_FILES.filter(
    (path) => existsSync(join(target, path)) && hashOf(join(target, path)) !== hashOf(join(PACKAGE_ROOT, path)),
  );
  if (differing.length === 0) {
    return [];
  }
  return [
    `Not the package's version: ${differing.join(", ")}. The read-only agents are restricted only by the package's ` +
      "hook, so until these are replaced they may run commands and write files it would refuse: delete a copy of an " +
      `earlier version and run vc-qa-agents again, or use ${FORCE_OURS} on a file ${MANIFEST_FILE} lists.`,
  ];
}

function syncAgentFiles(target, forceOurs) {
  const manifest = readManifest(target);
  const recorded = manifest?.files ?? {};
  const shipped = packageFiles();
  const files = {};
  const notes = [];
  const counts = { added: 0, updated: 0, current: 0, adopted: 0, removed: 0, edited: 0 };
  for (const path of shipped) {
    const hash = hashOf(join(PACKAGE_ROOT, path));
    const destination = join(target, path);
    if (!existsSync(destination)) {
      copyFile(target, path);
      files[path] = hash;
      counts.added += 1;
      continue;
    }
    const current = hashOf(destination);
    if (!Object.hasOwn(recorded, path)) {
      if (manifest === null && current === hash) {
        files[path] = hash;
        counts.adopted += 1;
      } else {
        notes.push(notOursLine(path, manifest !== null));
      }
    } else if (current === hash) {
      files[path] = hash;
      counts.current += 1;
    } else if (current === recorded[path] || forceOurs) {
      copyFile(target, path);
      files[path] = hash;
      counts.updated += 1;
    } else {
      files[path] = recorded[path];
      counts.edited += 1;
      notes.push(
        `Kept ${path}: edited since vc-qa-agents installed it, so the package's new version is not installed.`,
      );
    }
  }
  for (const path of Object.keys(recorded).filter((file) => !shipped.includes(file))) {
    if (!existsSync(join(target, path))) {
      continue;
    }
    if (hashOf(join(target, path)) === recorded[path] || forceOurs) {
      removeFile(target, path);
      counts.removed += 1;
    } else {
      files[path] = recorded[path];
      counts.edited += 1;
      const later = laterNameOf(path, shipped);
      notes.push(
        `Kept ${path}: the package no longer ships it, but it was edited since it was installed.` +
          (later === undefined ? "" : ` The package now ships it as ${later}.`),
      );
    }
  }
  if (manifest === null) {
    notes.push(...earlierNameLines(target, shipped));
  }
  notes.push(...guardLines(target));
  writeManifest(target, files);
  const { name, version } = packageIdentity();
  const adopted = counts.adopted > 0 ? `, ${counts.adopted} recorded from an earlier install` : "";
  const lines = [
    `Installed the QA agents of ${name} ${version} into .claude/ (agents, commands, skills, checks, hooks): ` +
      `${counts.added} added, ${counts.updated} updated, ${counts.current} unchanged${adopted}, ` +
      `${counts.removed} removed that the package no longer ships. ${MANIFEST_FILE} lists the package's files; ` +
      "commit it with .claude/.",
    ...notes,
  ];
  if (counts.edited > 0) {
    lines.push(
      `To take the package's version of the edited files: vc-qa-agents ${FORCE_OURS}. It replaces or removes only ` +
        `files that ${MANIFEST_FILE} lists.`,
    );
  }
  return lines;
}

function copyIfMissing(source, destination) {
  if (existsSync(destination)) {
    return false;
  }
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
  return true;
}

function hasHook(settingsPath) {
  return readFileSync(settingsPath, "utf8").includes(HOOK_SCRIPT.split("/").pop());
}

function addIgnores(target) {
  const path = join(target, ".gitignore");
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const ignored = text.split(/\r?\n/).map((line) => line.trim());
  const missing = GITIGNORE_LINES.filter((line) => !ignored.includes(line));
  if (missing.length > 0) {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const separator = text === "" || text.endsWith("\n") ? "" : eol;
    writeFileSync(path, `${text}${separator}${missing.join(eol)}${eol}`);
  }
  return missing;
}

function install(target, { written = [], forceOurs = false, wizard = false } = {}) {
  const lines = syncAgentFiles(target, forceOurs);

  const settings = join(target, ".claude", "settings.json");
  if (copyIfMissing(join(PACKAGE_ROOT, ".claude", "settings.json"), settings)) {
    lines.push("Created .claude/settings.json with the read-only shell hook.");
  } else if (!hasHook(settings)) {
    lines.push(
      `Kept your .claude/settings.json. Add the PreToolUse hook of the package's .claude/settings.json to it: ` +
        `without it the read-only agents are not restricted.`,
    );
  }

  if (written.includes(FACTS_FILE) && wizard) {
    lines.push("Wrote .qa/project.json for the suite.");
  } else if (written.includes(FACTS_FILE)) {
    lines.push(
      "Wrote .qa/project.json for the suite. Replace its example accounts and tracker with this repository's facts:",
    );
    lines.push("every agent reads it, and node .claude/checks/project-facts.mts refuses it until you have.");
  } else if (copyIfMissing(join(PACKAGE_ROOT, ".qa", "project.example.json"), join(target, ".qa", "project.json"))) {
    lines.push("Created .qa/project.json from the example. Replace its example values with this repository's facts:");
    lines.push("every agent reads it, and node .claude/checks/project-facts.mts refuses it until you have.");
  } else {
    lines.push("Kept your .qa/project.json.");
  }
  const serverKind = written.includes(MCP_FILE) ? "launcher" : browserServerKind(target);
  if (serverKind === "none") {
    lines.push(
      `No ${BROWSER_SERVER} server in ${MCP_FILE}: the agents that open the frontend need it. Add to its mcpServers: ` +
        `${LAUNCHER_SNIPPET} (see the QA agents guide, Browser).`,
    );
  } else if (serverKind === "direct") {
    lines.push(
      `The ${BROWSER_SERVER} server in ${MCP_FILE} starts @playwright/mcp itself, so nothing writes its secrets file: ` +
        `replace it with ${LAUNCHER_SNIPPET}`,
    );
  }

  const ignores = addIgnores(target);
  if (ignores.length > 0) {
    lines.push(`Added to .gitignore: ${ignores.join(" ")}`);
  }
  const packageDirs = [...new Set([ROOT_DIR, factsSuiteDir(target)])];
  if (!wizard && !packageDirs.some((dir) => existsSync(join(target, dir, "node_modules", "@babel", "parser")))) {
    lines.push("The checks need @babel/parser: npm install --save-dev --save-exact @babel/parser");
  }
  return lines;
}

function uninstall(target) {
  const manifest = readManifest(target);
  if (manifest === null) {
    return [`No ${MANIFEST_FILE}: nothing in .claude/ is recorded as the package's, so nothing was removed.`];
  }
  const kept = [];
  let removed = 0;
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (!existsSync(join(target, path))) {
      continue;
    }
    if (hashOf(join(target, path)) === hash) {
      removeFile(target, path);
      removed += 1;
    } else {
      kept.push(`Kept ${path}: edited since vc-qa-agents installed it; delete it yourself if you do not need it.`);
    }
  }
  removeFile(target, MANIFEST_FILE);
  const lines = [`Removed ${removed} files of the QA agents from .claude/, and ${MANIFEST_FILE}.`, ...kept];
  const settings = join(target, AGENTS_ROOT, "settings.json");
  if (existsSync(settings) && hasHook(settings)) {
    lines.push(
      "Kept .claude/settings.json: remove from it the PreToolUse hook that runs .claude/hooks/readonly-shell.mts.",
    );
  }
  if (existsSync(join(target, FACTS_FILE))) {
    lines.push(`Kept ${FACTS_FILE} and the agents' working files under .qa/: delete them if you do not need them.`);
  }
  return lines;
}

function factsSuiteDir(target) {
  try {
    const suiteDir = JSON.parse(readFileSync(join(target, FACTS_FILE), "utf8")).suiteDir;
    return typeof suiteDir === "string" && suiteDir !== "" ? suiteDir : ROOT_DIR;
  } catch {
    return ROOT_DIR;
  }
}

const SUITE_TEMPLATE = join(PACKAGE_ROOT, "templates", "suite");
const RENAMED = {
  "env.example": ".env.example",
  gitignore: ".gitignore",
  "biome.template.json": "biome.json",
  "CLAUDE.template.md": "CLAUDE.md",
};
const SUITE_DEPENDENCIES = [
  "@playwright/test",
  "zod",
  "@types/node",
  "typescript",
  "@biomejs/biome",
  "allure",
  "allure-playwright",
  "graphql",
  "@graphql-codegen/cli",
  "@graphql-codegen/client-preset",
  "@graphql-codegen/schema-ast",
  "@graphql-typed-document-node/core",
  "swagger-typescript-api",
  "@babel/parser",
];
const SUITE_SCRIPTS = {
  typecheck: "tsc --noEmit",
  check: "biome check --write .",
  "check:ci": "biome ci .",
  codegen:
    "node scripts/check-platform.ts && graphql-codegen --config codegen.ts && node scripts/generate-rest-types.ts",
  pretest: "node -e \"require('node:fs').rmSync('reports/allure-results', { recursive: true, force: true })\"",
  test: "playwright test",
  report: "allure generate reports/allure-results --clean",
  "report:open": "allure open reports/allure-report",
};

function templateFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? templateFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

function inSuite(suiteDir, path) {
  return suiteDir === ROOT_DIR ? path : `${suiteDir}/${path}`;
}

function copySuiteTemplate(target, suiteDir) {
  const written = [];
  const kept = [];
  for (const source of templateFiles(SUITE_TEMPLATE)) {
    const path = relative(SUITE_TEMPLATE, source).split(sep).join("/");
    const name = RENAMED[path] ?? path;
    const destination = name === MCP_FILE || name.startsWith(QA_DIR) ? name : inSuite(suiteDir, name);
    if (copyIfMissing(source, join(target, destination))) {
      written.push(destination);
    } else {
      kept.push(destination);
    }
  }
  const env = inSuite(suiteDir, ".env");
  if (copyIfMissing(join(SUITE_TEMPLATE, "env.example"), join(target, env))) {
    written.push(env);
  }
  return { written, kept };
}

function suiteDirOf(positional) {
  const [dir, extra] = positional;
  if (extra !== undefined) {
    throw new Error(USAGE);
  }
  const plain = (dir ?? ROOT_DIR).replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (plain === "" || plain === ROOT_DIR) {
    return ROOT_DIR;
  }
  if (!SUITE_DIR.test(plain) || plain.split("/").includes("..")) {
    throw new Error(`The suite directory must be a plain directory inside the repository, not ${dir}`);
  }
  return plain;
}

function suiteCommand(text, suiteDir) {
  if (text.startsWith(NPM)) {
    return `npm --prefix ${suiteDir} ${text.slice(NPM.length)}`;
  }
  if (text.startsWith(NPX_PLAYWRIGHT)) {
    const rest = text.slice(NPX_PLAYWRIGHT.length);
    return `npm exec --prefix ${suiteDir} --no -- playwright test --config=${suiteDir}${rest}`;
  }
  return text;
}

function suiteCommands(commands, suiteDir) {
  return Object.fromEntries(
    Object.entries(commands).map(([key, value]) => [
      key,
      typeof value === "string" ? suiteCommand(value, suiteDir) : suiteCommands(value, suiteDir),
    ]),
  );
}

function pointFactsAtSuite(target, suiteDir) {
  const path = join(target, FACTS_FILE);
  const facts = JSON.parse(readFileSync(path, "utf8"));
  facts.suiteDir = suiteDir;
  facts.commands = suiteCommands(facts.commands, suiteDir);
  facts.healerPaths = facts.healerPaths.map((dir) => inSuite(suiteDir, dir));
  writeFileSync(path, `${JSON.stringify(facts, null, 2)}\n`);
}

function readOwnManifest() {
  return JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
}

function mergePackageJson(target, own) {
  const path = join(target, "package.json");
  const existing = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : { name: basename(target), private: true };
  const manifest = withOverrides(existing, suiteOverrides(own));
  manifest.type = "module";
  manifest.scripts = { ...SUITE_SCRIPTS, ...manifest.scripts };
  if (manifest.scripts.test?.startsWith('echo "Error: no test specified"')) {
    manifest.scripts.test = SUITE_SCRIPTS.test;
  }
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function run(command, target) {
  process.stdout.write(`> ${command}\n`);
  const result = spawnSync(command, { cwd: target, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    throw new Error(`"${command}" failed with exit code ${result.status}`);
  }
}

function installDependencies(target, own) {
  const specs = dependencySpecs(own, SUITE_DEPENDENCIES);
  run(`npm install --save-dev --save-exact ${specs.join(" ")}`, target);
  run("npx playwright install chromium", target);
}

function runVariables(target, suiteDir) {
  const envPath = join(target, suiteDir, ".env");
  const vars = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && value !== "") {
      vars[name] = value;
    }
  }
  return vars;
}

function certificateConfirmer(switches) {
  if (!isInteractive(switches)) {
    return undefined;
  }
  return {
    async confirm(text) {
      const prompter = createPrompter();
      try {
        return await prompter.confirm(text);
      } finally {
        prompter.close();
      }
    },
  };
}

function readiness(target, suiteDir, switches, skipInstall, withheld = []) {
  return runReadiness({
    projectDir: target,
    suiteDir,
    vars: runVariables(target, suiteDir),
    skipInstall,
    skipVerify: switches.has("--skip-verify"),
    prompter: certificateConfirmer(switches),
    withheld,
  });
}

function verdictLines(target, rows) {
  const failing = rows.filter((row) => row.status === "fail");
  if (failing.length > 0) {
    return [
      "Not ready:",
      ...formatTable(failing)
        .split("\n")
        .map((line) => `  ${line}`),
    ];
  }
  const skipped = rows.filter((row) => row.status === "skipped");
  if (skipped.length > 0) {
    return [
      `Not verified: ${skipped.map((row) => `${row.check} (${row.detail})`).join(", ")}`,
      "Run npx vc-qa-agents doctor once that is fixed.",
    ];
  }
  return [`Ready: run claude in ${target} and approve the ${BROWSER_SERVER} server when it asks.`];
}

function unsavedPasswords(answers) {
  return Object.keys(answers.passwords).filter((name) => !answers.persistPasswords.includes(name));
}

function unsavedLines(answers) {
  const unsaved = unsavedPasswords(answers);
  if (unsaved.length === 0) {
    return [];
  }
  return [
    `Passwords from the shell, not saved: ${unsaved.join(", ")}. A new terminal needs them set again; ` +
      "vc-qa-agents init --save-passwords writes them to .env.",
  ];
}

async function askAnswers({ values, switches, envText, firstRun, facts, onInterrupt }) {
  const fromFile = parseEnv(envText);
  const prompter = isInteractive(switches) ? createPrompter(process.stdin, process.stdout, onInterrupt) : undefined;
  try {
    return await resolveAnswers({
      values,
      switches,
      shell: process.env,
      existingEnv: firstRun ? {} : fromFile,
      facts,
      prompter,
    });
  } finally {
    prompter?.close();
  }
}

async function init(target, { switches, values, suiteDir }) {
  checkGivenValues({ values, switches, shell: process.env });
  const skipInstall = switches.has("--skip-install");
  const suite = join(target, suiteDir);
  const own = readOwnManifest();
  const { written, kept } = copySuiteTemplate(target, suiteDir);
  const envFile = inSuite(suiteDir, ".env");
  const envPath = join(target, envFile);
  const firstRun = written.includes(envFile);
  const answers = await discardOnFailure(envPath, firstRun, async () => {
    const lines = [`Wrote ${written.length} files of the test suite.`];
    if (kept.length > 0) {
      lines.push(`Kept the files that already exist: ${kept.join(", ")}`);
    }
    if (suiteDir !== ROOT_DIR && written.includes(FACTS_FILE)) {
      pointFactsAtSuite(target, suiteDir);
      lines.push(`The suite is its own npm project in ${suiteDir}/; .qa/project.json names it as suiteDir.`);
    }
    mergePackageJson(suite, own);
    lines.push(`Added the suite's scripts to ${inSuite(suiteDir, "package.json")}.`);
    if (written.includes(MCP_FILE)) {
      lines.push(
        `Wrote ${MCP_FILE}: the Playwright MCP server "${BROWSER_SERVER}" that the agents open the frontend with, ` +
          "pinned to one version. Commit it; Claude Code asks once before it starts the server.",
      );
    }
    lines.push(...install(target, { written, forceOurs: switches.has(FORCE_OURS), wizard: true }));
    if (!switches.has("--yes") && !isInteractive(switches)) {
      lines.push(NO_TERMINAL);
    }
    printLines(lines);
    const resolved = await askAnswers({
      values,
      switches,
      envText: readFileSync(envPath, "utf8"),
      firstRun,
      facts: JSON.parse(readFileSync(join(target, FACTS_FILE), "utf8")),
      onInterrupt() {
        removeIfCreated(envPath, firstRun);
        process.exit(130);
      },
    });
    writeAnswers(target, suiteDir, resolved, { replace: firstRun });
    return resolved;
  });
  printLines(answers.notes);
  if (!skipInstall) {
    installDependencies(suite, own);
  }
  const rows = await readiness(target, suiteDir, switches, skipInstall, unsavedPasswords(answers));
  return ["", formatTable(rows), "", ...unsavedLines(answers), ...verdictLines(target, rows)];
}

async function doctor(target, switches) {
  if (!existsSync(join(target, FACTS_CHECK))) {
    throw new Error("Run npx vc-qa-agents first: .claude/checks is missing.");
  }
  const rows = await readiness(target, suiteDirOf([factsSuiteDir(target)]), switches, false);
  if (rows.some((row) => row.status === "fail")) {
    process.exitCode = 1;
  }
  return [formatTable(rows), "", ...verdictLines(target, rows)];
}

function main(target, { command, positional, switches, values }) {
  readManifest(target);
  if (command === "init") {
    return init(target, { switches, values, suiteDir: suiteDirOf(positional) });
  }
  if (command === "doctor") {
    return doctor(target, switches);
  }
  return command === "uninstall" ? uninstall(target) : install(target, { forceOurs: switches.has(FORCE_OURS) });
}

function printLines(lines) {
  for (const line of lines) {
    process.stdout.write(`${line}\n`);
  }
}

try {
  printLines(await main(process.cwd(), parseArguments(process.argv.slice(2), USAGE)));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = message === CANCELLED ? 130 : 1;
}
