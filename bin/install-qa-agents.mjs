#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_DIRS = ["agents", "commands", "skills", "checks", "hooks"];
const HOOK_SCRIPT = ".claude/hooks/readonly-shell.mts";
const MCP_FILE = ".mcp.json";
const BROWSER_SERVER = "playwright";
const FACTS_FILE = ".qa/project.json";
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

function copyAgentFiles(target) {
  const copied = [];
  for (const dir of AGENT_DIRS) {
    const source = join(PACKAGE_ROOT, ".claude", dir);
    if (!existsSync(source)) {
      continue;
    }
    cpSync(source, join(target, ".claude", dir), {
      recursive: true,
      force: true,
      filter: (path) => {
        if (statSync(path).isFile()) {
          copied.push(relative(PACKAGE_ROOT, path));
        }
        return true;
      },
    });
  }
  return copied;
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

function hasBrowserServer(target) {
  const path = join(target, MCP_FILE);
  if (!existsSync(path)) {
    return false;
  }
  try {
    return Object.hasOwn(JSON.parse(readFileSync(path, "utf8")).mcpServers ?? {}, BROWSER_SERVER);
  } catch {
    return false;
  }
}

function missingIgnores(target) {
  const path = join(target, ".gitignore");
  const ignored = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  return GITIGNORE_LINES.filter((line) => !ignored.includes(line));
}

function install(target, written = []) {
  const lines = [];
  const copied = copyAgentFiles(target);
  lines.push(`Copied ${copied.length} files into .claude/ (agents, commands, skills, checks, hooks).`);

  const settings = join(target, ".claude", "settings.json");
  if (copyIfMissing(join(PACKAGE_ROOT, ".claude", "settings.json"), settings)) {
    lines.push("Created .claude/settings.json with the read-only shell hook.");
  } else if (!hasHook(settings)) {
    lines.push(
      `Kept your .claude/settings.json. Add the PreToolUse hook of the package's .claude/settings.json to it: ` +
        `without it the read-only agents are not restricted.`,
    );
  }

  if (written.includes(FACTS_FILE)) {
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
  if (!written.includes(MCP_FILE) && !hasBrowserServer(target)) {
    lines.push(
      `No ${BROWSER_SERVER} server in ${MCP_FILE}: the agents that open the frontend need a Playwright MCP server named ` +
        `"${BROWSER_SERVER}" (see the QA agents guide, Browser).`,
    );
  }

  const ignores = missingIgnores(target);
  if (ignores.length > 0) {
    lines.push(`Add to .gitignore: ${ignores.join(" ")}`);
  }
  const packageDirs = [...new Set([ROOT_DIR, factsSuiteDir(target)])];
  if (!packageDirs.some((dir) => existsSync(join(target, dir, "node_modules", "@babel", "parser")))) {
    lines.push("The checks need @babel/parser: npm install --save-dev --save-exact @babel/parser");
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
  codegen: "graphql-codegen --config codegen.ts && node scripts/generate-rest-types.ts",
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

function wrapForWindows(path) {
  const config = JSON.parse(readFileSync(path, "utf8"));
  for (const server of Object.values(config.mcpServers)) {
    if (server.command === "npx") {
      server.args = ["/c", "npx", ...server.args];
      server.command = "cmd";
    }
  }
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
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
  if (written.includes(MCP_FILE) && process.platform === "win32") {
    wrapForWindows(join(target, MCP_FILE));
  }
  return { written, kept };
}

function suiteDirOf(options) {
  const [dir, extra] = options.filter((option) => !option.startsWith("--"));
  if (extra !== undefined) {
    throw new Error("usage: vc-qa-agents init [<suite directory>] [--skip-install]");
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

function mergePackageJson(target) {
  const path = join(target, "package.json");
  const manifest = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : { name: basename(target), private: true };
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

function installDependencies(target) {
  const own = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
  const versions = { ...own.peerDependencies, ...own.devDependencies };
  const specs = SUITE_DEPENDENCIES.map((name) => `${name}@${JSON.stringify(versions[name] ?? "latest")}`);
  run(`npm install --save-dev --save-exact ${specs.join(" ")}`, target);
  run("npx playwright install chromium", target);
}

function init(target, { skipInstall, suiteDir }) {
  const lines = [];
  const suite = join(target, suiteDir);
  const { written, kept } = copySuiteTemplate(target, suiteDir);
  lines.push(`Wrote ${written.length} files of the test suite.`);
  if (kept.length > 0) {
    lines.push(`Kept the files that already exist: ${kept.join(", ")}`);
  }
  if (suiteDir !== ROOT_DIR && written.includes(FACTS_FILE)) {
    pointFactsAtSuite(target, suiteDir);
    lines.push(`The suite is its own npm project in ${suiteDir}/; .qa/project.json names it as suiteDir.`);
  }
  mergePackageJson(suite);
  lines.push(`Added the suite's scripts to ${inSuite(suiteDir, "package.json")}.`);
  if (!skipInstall) {
    installDependencies(suite);
  }
  if (written.includes(MCP_FILE)) {
    lines.push(
      `Wrote ${MCP_FILE}: the Playwright MCP server "${BROWSER_SERVER}" that the agents open the frontend with, ` +
        "pinned to one version. Commit it; Claude Code asks once before it starts the server.",
    );
  }
  lines.push(...install(target, written));
  lines.push(
    "",
    "Next:",
    ...(suiteDir === ROOT_DIR
      ? []
      : [`  Steps 1 to 4 run in ${suiteDir}/; the rest, and claude, in this directory, the repository root.`]),
    `  1. Fill in ${inSuite(suiteDir, ".env")}: the platform, the frontend, the administrator, STORE_ID and the customer passwords.`,
    "  2. npm run codegen     GraphQL and REST types from the platform",
    "  3. npm test            the first test signs a new user in",
    "  4. npm run report && npm run report:open",
    "  5. Replace the example accounts and tracker in .qa/project.json; node .claude/checks/project-facts.mts must pass.",
    "  6. node .claude/checks/browser-secrets.mts writes the passwords the browser server types (.qa/browser-secrets.local.env,",
    "     git-ignored), then start claude, approve the playwright server and run /qa <task>.",
  );
  return lines;
}

const [command, ...options] = process.argv.slice(2);
try {
  const lines =
    command === "init"
      ? init(process.cwd(), { skipInstall: options.includes("--skip-install"), suiteDir: suiteDirOf(options) })
      : install(process.cwd());
  for (const line of lines) {
    process.stdout.write(`${line}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
