#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_DIRS = ["agents", "commands", "skills", "checks", "hooks"];
const HOOK_SCRIPT = ".claude/hooks/readonly-shell.mts";
const GITIGNORE_LINES = [
  ".qa/contracts/",
  ".qa/runs/",
  ".qa/reports/",
  ".qa/kb/",
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

function missingIgnores(target) {
  const path = join(target, ".gitignore");
  const ignored = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  return GITIGNORE_LINES.filter((line) => !ignored.includes(line));
}

function install(target) {
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

  if (copyIfMissing(join(PACKAGE_ROOT, ".qa", "project.example.json"), join(target, ".qa", "project.json"))) {
    lines.push("Created .qa/project.json from the example. Replace its example values with this repository's facts:");
    lines.push("every agent reads it. node .claude/checks/project-facts.mts validates it.");
  } else {
    lines.push("Kept your .qa/project.json.");
  }

  const ignores = missingIgnores(target);
  if (ignores.length > 0) {
    lines.push(`Add to .gitignore: ${ignores.join(" ")}`);
  }
  if (!existsSync(join(target, "node_modules", "@babel", "parser"))) {
    lines.push("The checks need @babel/parser: npm install --save-dev --save-exact @babel/parser");
  }
  return lines;
}

for (const line of install(process.cwd())) {
  process.stdout.write(`${line}\n`);
}
