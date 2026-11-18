export const READ_ONLY_AGENTS = ["qa-reviewer", "qa-explorer", "qa-coverage", "qa-judge"] as const;

export const ALLOWED_QA_MODULES = [
  "project-facts",
  "ticket-card",
  "contract",
  "reconcile-run",
  "judge-verdict",
  "rank-gaps",
] as const;

const TOKEN = /^[A-Za-z0-9_./:=@,+^~-]+$/;
const GIT_SUBCOMMANDS = ["diff", "log", "show", "status"];
const GIT_FORBIDDEN_PREFIXES = ["--output", "--ext-diff", "--textconv", "--no-index", "--open-files", "--exec", "-O"];
const PLAYWRIGHT_FLAGS = [
  /^--list$/,
  /^--reporter=(json|list|line|dot|null)$/,
  /^--project=[\w.-]+$/,
  /^--grep(-invert)?=\S+$/,
];
const PLAYWRIGHT_PATH = /^[\w./@-]+$/;
const JSON_OUTPUT_ASSIGNMENT = /^PLAYWRIGHT_JSON_OUTPUT_FILE=(\.qa\/runs\/[\w./-]+)$/;
const QA_MODULE_PATH = new RegExp(`^qa/(${ALLOWED_QA_MODULES.join("|")}).mts$`);
const MAX_SHOWN_COMMAND = 80;

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
  return rest.every((token) =>
    token.startsWith("-") ? PLAYWRIGHT_FLAGS.some((flag) => flag.test(token)) : PLAYWRIGHT_PATH.test(token),
  );
}

function isQaModule(tokens: readonly string[]): boolean {
  return tokens[0] === "node" && QA_MODULE_PATH.test(tokens[1] ?? "");
}

function isSafeRunPath(path: string): boolean {
  return !path.split("/").includes("..");
}

function withoutOutputAssignment(tokens: readonly string[]): readonly string[] | undefined {
  const match = JSON_OUTPUT_ASSIGNMENT.exec(tokens[0] ?? "");
  if (match === null) {
    return tokens;
  }
  return isSafeRunPath(match[1] ?? "") ? tokens.slice(1) : undefined;
}

/**
 * True only for a single plain command on the allowlist: `npx playwright test --list …`, `git diff|log|show|status …`,
 * `node qa/<module>.mts …`. No chaining, substitution, redirection, quoting, globbing or variable expansion.
 */
export function isReadOnlyCommand(command: string): boolean {
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
  return isQaModule(tokens);
}

export function isReadOnlyAgent(name: string | undefined): boolean {
  return READ_ONLY_AGENTS.some((agent) => agent === name);
}

/**
 * Decides a PreToolUse hook call for the Bash tool: a one-line reason to block it, or undefined to let it pass.
 * Only the read-only agents are limited; the main session and every other agent pass untouched.
 */
export function hookBlockReason(input: unknown): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  const agent = input["agent_type"];
  if (typeof agent !== "string" || !isReadOnlyAgent(agent)) {
    return undefined;
  }
  const toolInput = input["tool_input"];
  const command = isRecord(toolInput) ? toolInput["command"] : undefined;
  if (typeof command === "string" && isReadOnlyCommand(command)) {
    return undefined;
  }
  const shown = JSON.stringify(typeof command === "string" ? command.slice(0, MAX_SHOWN_COMMAND) : null);
  return `${agent} is read-only and may run only git diff|log|show|status, npx playwright test --list and node qa/<module>.mts; blocked: ${shown}`;
}
