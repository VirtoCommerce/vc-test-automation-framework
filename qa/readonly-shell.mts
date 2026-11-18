import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export const READ_ONLY_AGENTS = ["qa-reviewer", "qa-explorer", "qa-coverage", "qa-judge"] as const;

export const ALLOWED_QA_MODULES = ["project-facts", "ticket-card", "contract", "reconcile-run", "rank-gaps"] as const;

export const JUDGE_AGENT = "qa-judge";

export const JUDGE_QA_MODULES = ["judge-verdict", "prove-fails"] as const;

export const JUDGE_WRITE_DIR = ".qa/judge";

export const WRITING_TOOLS = ["Edit", "MultiEdit", "NotebookEdit", "PowerShell"] as const;

const TOKEN = /^[A-Za-z0-9_./:=@,+^~-]+$/;
const GIT_SUBCOMMANDS = ["diff", "log", "show", "status"];
const GIT_FORBIDDEN_PREFIXES = ["--output", "--ext-diff", "--textconv", "--no-index", "--open-files", "--exec", "-O"];
const PLAYWRIGHT_FLAGS = [/^--list$/, /^--reporter=(json|list|null)$/, /^--project=[\w.-]+$/, /^--grep(-invert)?=\S+$/];
const PLAYWRIGHT_PATH = /^[\w./@-]+$/;
const REPORTER_FLAG = /^--reporter=/;
const JSON_OUTPUT_ASSIGNMENT = /^PLAYWRIGHT_JSON_OUTPUT_FILE=\.qa\/runs\/[\w-]+\/review-list\.[\w-]+\.json$/;
const QA_MODULE_PATH = modulePattern(ALLOWED_QA_MODULES);
const JUDGE_QA_MODULE_PATH = modulePattern([...ALLOWED_QA_MODULES, ...JUDGE_QA_MODULES]);
const MAX_SHOWN_COMMAND = 80;

function modulePattern(modules: readonly string[]): RegExp {
  return new RegExp(`^qa/(${modules.join("|")})[.]mts$`);
}

function bareName(agent: string | undefined): string | undefined {
  return agent?.split(":").pop();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGitRead(tokens: readonly string[]): boolean {
  const [, subcommand, ...rest] = tokens;
  if (subcommand === undefined || !GIT_SUBCOMMANDS.includes(subcommand)) {
    return false;
  }
  return rest.every((token) => !GIT_FORBIDDEN_PREFIXES.some((prefix) => token.startsWith(prefix)));
}

function isPlaywrightList(tokens: readonly string[]): boolean {
  const [, , , ...rest] = tokens;
  if (tokens[1] !== "playwright" || tokens[2] !== "test" || !rest.includes("--list")) {
    return false;
  }
  if (rest.filter((token) => REPORTER_FLAG.test(token)).length !== 1) {
    return false;
  }
  return rest.every((token) =>
    token.startsWith("-") ? PLAYWRIGHT_FLAGS.some((flag) => flag.test(token)) : PLAYWRIGHT_PATH.test(token),
  );
}

function isQaModule(tokens: readonly string[], agent: string | undefined): boolean {
  const pattern = bareName(agent) === JUDGE_AGENT ? JUDGE_QA_MODULE_PATH : QA_MODULE_PATH;
  return tokens[0] === "node" && pattern.test(tokens[1] ?? "");
}

function withoutOutputAssignment(tokens: readonly string[]): readonly string[] | undefined {
  const [first = ""] = tokens;
  if (!first.startsWith("PLAYWRIGHT_JSON_OUTPUT_FILE=")) {
    return tokens;
  }
  return JSON_OUTPUT_ASSIGNMENT.test(first) ? tokens.slice(1) : undefined;
}

/**
 * True only for a single plain command on the allowlist: `npx playwright test --list --reporter=json|list|null …`,
 * `git diff|log|show|status …`, `node qa/<module>.mts …`; `qa-judge` also has `judge-verdict` and `prove-fails`.
 * No chaining, substitution, redirection, quoting, globbing or variable expansion.
 */
export function isReadOnlyCommand(command: string, agent?: string): boolean {
  const text = command.trim();
  if (text === "") {
    return false;
  }
  const tokens = text.split(" ");
  if (!tokens.every((token) => TOKEN.test(token))) {
    return false;
  }
  const bare = withoutOutputAssignment(tokens);
  if (bare === undefined) {
    return false;
  }
  if (bare !== tokens) {
    return bare[0] === "npx" && isPlaywrightList(bare);
  }
  if (tokens[0] === "git") {
    return isGitRead(tokens);
  }
  if (tokens[0] === "npx") {
    return isPlaywrightList(tokens);
  }
  return isQaModule(tokens, agent);
}

export function isReadOnlyAgent(name: string | undefined): boolean {
  const bare = bareName(name);
  return READ_ONLY_AGENTS.some((agent) => agent === bare);
}

function realPathOf(path: string): string | undefined {
  let existing = path;
  while (!exists(existing)) {
    const parent = dirname(existing);
    if (parent === existing) {
      return undefined;
    }
    existing = parent;
  }
  try {
    return join(realpathSync(existing), relative(existing, path));
  } catch {
    return undefined;
  }
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function isInsideJudgeDir(projectDir: string, file: string): boolean {
  const area = realPathOf(resolve(projectDir, JUDGE_WRITE_DIR));
  const target = realPathOf(resolve(projectDir, file));
  if (area === undefined || target === undefined) {
    return false;
  }
  const path = relative(area, target);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

function writeBlockReason(agent: string, toolInput: unknown, projectDir: string): string | undefined {
  if (bareName(agent) !== JUDGE_AGENT) {
    return `${agent} is read-only and may not write files; blocked`;
  }
  const file = isRecord(toolInput) ? toolInput["file_path"] : undefined;
  if (typeof file === "string" && file !== "" && isInsideJudgeDir(projectDir, file)) {
    return undefined;
  }
  const shown = JSON.stringify(typeof file === "string" ? file.slice(0, MAX_SHOWN_COMMAND) : null);
  return `${agent} may write only under ${JUDGE_WRITE_DIR}/; blocked: ${shown}`;
}

/**
 * Decides a PreToolUse hook call for the Bash and Write tools: a one-line reason to block it, or undefined to let it
 * pass. Only the read-only agents are limited; the main session and every other agent pass untouched. A read-only
 * agent's Bash call must be on the allowlist, its Write call is allowed for `qa-judge` under the real `.qa/judge/` of
 * the project directory only (a link that leaves it does not count), the other writing tools are blocked, and the
 * tools that only read pass.
 */
export function hookBlockReason(input: unknown, projectDir: string = process.cwd()): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  const agent = input["agent_type"];
  if (typeof agent !== "string" || !isReadOnlyAgent(agent)) {
    return undefined;
  }
  const tool = input["tool_name"];
  const toolInput = input["tool_input"];
  if (tool === "Write") {
    return writeBlockReason(agent, toolInput, projectDir);
  }
  if (tool !== undefined && typeof tool !== "string") {
    return `${agent} is read-only and its tool could not be identified; blocked`;
  }
  if (WRITING_TOOLS.some((writing) => writing === tool)) {
    return `${agent} is read-only and may not use ${tool}; blocked`;
  }
  if (tool !== undefined && tool !== "Bash") {
    return undefined;
  }
  const command = isRecord(toolInput) ? toolInput["command"] : undefined;
  if (typeof command === "string" && isReadOnlyCommand(command, agent)) {
    return undefined;
  }
  const shown = JSON.stringify(typeof command === "string" ? command.slice(0, MAX_SHOWN_COMMAND) : null);
  return `${agent} is read-only and may run only git diff|log|show|status, npx playwright test --list --reporter=json|list|null and node qa/<module>.mts; blocked: ${shown}`;
}
