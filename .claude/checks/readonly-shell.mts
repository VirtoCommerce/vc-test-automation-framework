import { execFileSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { passwordNames, runVariables } from "./browser-secrets.mts";
import { EXTRACTORS } from "./explore-extractors.mts";
import { PROJECT_FACTS_PATH, playwrightConfigArgs, readProjectFactsIn, SHORT_NAME_SEGMENT } from "./project-facts.mts";
import { standOrigins } from "./stand.mts";

/** The suite's Playwright config arguments (`playwrightConfigArgs`), or undefined when the facts cannot be read. */
export type SuiteConfig = readonly string[] | undefined;

export const READ_ONLY_AGENTS = ["qa-reviewer", "qa-explorer", "qa-coverage", "qa-judge"] as const;

export const HEALER_AGENT = "qa-healer";

export const ALLOWED_QA_MODULES = [
  "project-facts",
  "ticket-card",
  "contract",
  "reconcile-run",
  "rank-gaps",
  "stand",
  "test-shape",
  "test-duration",
] as const;

export const JUDGE_AGENT = "qa-judge";

export const JUDGE_QA_MODULES = ["judge-verdict", "prove-fails"] as const;

export const JUDGE_WRITE_DIR = ".qa/judge";

export const EXPLORER_AGENT = "qa-explorer";

export const COVERAGE_AGENT = "qa-coverage";

export const EXPLORER_WRITE_DIR = ".qa/reports";

export const HEALER_RUN_DIR = ".qa/runs";

export const BROWSER_TOOL_PREFIX = "mcp__playwright__browser_";

const BROWSER_TOOL_KEYS: Readonly<Record<string, readonly string[]>> = {
  navigate: ["url"],
  navigate_back: [],
  snapshot: ["target", "depth", "boxes"],
  take_screenshot: ["type", "fullPage", "element", "target"],
  click: ["element", "target", "doubleClick", "button", "modifiers"],
  hover: ["element", "target"],
  type: ["element", "target", "text", "submit", "slowly"],
  fill_form: ["fields"],
  find: ["text", "regex"],
  handle_dialog: ["accept", "promptText"],
  select_option: ["element", "target", "values"],
  press_key: ["key"],
  wait_for: ["time", "text", "textGone"],
  tabs: ["action", "index", "url"],
  console_messages: ["level", "all"],
  network_requests: ["includeStatic", "static", "filter"],
  network_request: ["index", "part"],
  evaluate: ["function", "element", "target"],
  resize: ["width", "height"],
  close: [],
};

const RESPONSE_BODY = "response-body";

export const BROWSER_TOOLS = Object.keys(BROWSER_TOOL_KEYS).map((name) => `${BROWSER_TOOL_PREFIX}${name}`);

export const WRITING_TOOLS = ["Edit", "MultiEdit", "NotebookEdit", "PowerShell"] as const;

const TOKEN = /^[A-Za-z0-9_./:=@,+^~-]+$/;
const GIT_SUBCOMMANDS = ["diff", "log", "show", "status"];
const GIT_FORBIDDEN_PREFIXES = ["--output", "--ext-diff", "--textconv", "--no-index", "--open-files", "--exec", "-O"];
const PLAYWRIGHT_FLAGS = [
  /^--list$/,
  /^--reporter=(json|list|null)$/,
  /^--project=[\w.-]+$/,
  /^--grep(-invert)?=\S+$/,
  /^--repeat-each=\d{1,2}$/,
];
const PLAYWRIGHT_PATH = /^[\w./@-]+$/;
const CHECKS_DIR = ".claude/checks";
const CHECKS_DIR_PATTERN = CHECKS_DIR.replace(/[.]/g, "[.]");
const PROVE_FAILS_PATH = `${CHECKS_DIR}/prove-fails.mts`;
const TEST_SHAPE_PATH = `${CHECKS_DIR}/test-shape.mts`;
const TEST_DURATION_PATH = `${CHECKS_DIR}/test-duration.mts`;
const TEST_DURATION_ARGUMENTS = [2, 3];
const PROVE_FAILS_PROJECT = /^--project=[\w.-]+$/;
const REPORTER_FLAG = /^--reporter=/;
const OUTPUT_VARIABLE = "PLAYWRIGHT_JSON_OUTPUT_FILE=";
const REVIEWER_AGENT = "qa-reviewer";
const REVIEWER_OUTPUT =
  /^PLAYWRIGHT_JSON_OUTPUT_FILE=\.qa\/runs\/(?![Hh][Ee][Aa][Ll]-)[\w-]+\/review-list\.[\w-]+\.json$/;
const HEALER_REVIEW_OUTPUT =
  /^PLAYWRIGHT_JSON_OUTPUT_FILE=\.qa\/runs\/heal-[a-z0-9]+(-[a-z0-9]+)*\/review-list\.[\w-]+\.json$/;
const NPX = "npx";
const NPX_NO_INSTALL = "--no";
const END_OF_OPTIONS = "--";
const QA_MODULE_PATH = modulePattern(ALLOWED_QA_MODULES);
const JUDGE_QA_MODULE_PATH = modulePattern([...ALLOWED_QA_MODULES, ...JUDGE_QA_MODULES]);
const MAX_SHOWN_COMMAND = 80;

/**
 * Text shaped like a credential: a JSON Web Token, an `access_token`, `refresh_token` or `id_token` field, a
 * `"password"` field or a `Bearer` header. The explorer's report and an observed value in a contract never hold one.
 */
export const CREDENTIAL_SHAPE =
  /\beyJ[\w-]+\.[\w-]+\.[\w-]+|access_token|refresh_token|id_token|"password"|\bBearer\s/i;

const QA_DIR_TOKEN = /(^|\/)\.qa(\/|$)/i;
const REPORT_FILE = /^explore-[a-z0-9]+(-[a-z0-9]+)*\.md$/;
const COVERAGE_FILE = /^coverage-[0-9]{4}-[0-9]{2}-[0-9]{2}(-[a-z0-9-]+)?\.md$/;
const JUDGE_FILE = /\.json$/;
const PATH_SEPARATORS = /[\\/]/;
const WEB_PROTOCOLS = ["http:", "https:"];
const HEAL_SLUG = /^heal-[a-z0-9]+(-[a-z0-9]+)*$/;
const HEAL_REPORT = /^(heal-[a-z0-9]+(-[a-z0-9]+)*|flaky)\.md$/;
const HEAL_JSON_OUTPUT = /^PLAYWRIGHT_JSON_OUTPUT_FILE=\.qa\/runs\/heal-[a-z0-9]+(-[a-z0-9]+)*\/[\w.-]+\.json$/;
const HEALER_PLAYWRIGHT_FLAGS = [
  /^--project=[\w.-]+$/,
  /^--repeat-each=\d{1,3}$/,
  /^--retries=0$/,
  /^--grep=[\w.+^~,:@/=][\w.+^~,:@/=-]*$/,
];
const HEALER_REPORTER = /^--reporter=(list|json|null)(,(list|json))*$/;
const GREP_VALUE = /^[\w.+^~,:@/=][\w.+^~,:@/=-]*$/;
const GUARD_BASE = /^--base=[0-9a-f]{7,64}$/;
const GUARD_PATH = `${CHECKS_DIR}/expectation-guard.mts`;
const DRIVE_PATH = /^[A-Za-z]:/;
const CONFIG_FLAG = "--config";
const CONFIG_PREFIX = `${CONFIG_FLAG}=`;
const CONFIG_SHORT_FLAG = "-c";
const NO_EMIT = "--noEmit";
const ENV_FILE_NAME = /^\.env(\.|$)/;
const WINDOWS_TRAILING = /[. ]+$/;
const GIT_DIR = ".git";
const NO_HOOKS_DIR = "";
const GIT_HOOKS_DIR_ARGS = ["-c", "core.fsmonitor=false", "rev-parse", "--path-format=absolute", "--git-path", "hooks"];

function modulePattern(modules: readonly string[]): RegExp {
  return new RegExp(`^${CHECKS_DIR_PATTERN}/(${modules.join("|")})[.]mts$`);
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

function npxArgs(tokens: readonly string[]): readonly string[] | undefined {
  if (tokens[0] !== NPX || tokens[1] !== NPX_NO_INSTALL) {
    return undefined;
  }
  return tokens[2] === END_OF_OPTIONS ? tokens.slice(3) : tokens.slice(2);
}

function isConfigFlag(token: string): boolean {
  return token === CONFIG_SHORT_FLAG || token.startsWith(CONFIG_FLAG);
}

/**
 * True when `args` carry exactly the suite's config arguments (`playwrightConfigArgs`): `--config=<suiteDir>` once,
 * or no config flag for a suite at the repository root. An unknown config (the facts could not be read) never passes.
 */
function hasSuiteConfig(args: readonly string[], config: SuiteConfig): boolean {
  if (config === undefined) {
    return false;
  }
  const given = args.filter(isConfigFlag);
  return given.length === config.length && given.every((token, index) => token === config[index]);
}

function namesEnvFile(path: string): boolean {
  return path
    .split(PATH_SEPARATORS)
    .some((segment) => ENV_FILE_NAME.test(segment.toLowerCase().replace(WINDOWS_TRAILING, "")));
}

function isPlaywrightList(tokens: readonly string[], config: SuiteConfig): boolean {
  const [tool, subcommand, ...rest] = npxArgs(tokens) ?? [];
  if (tool !== "playwright" || subcommand !== "test" || !rest.includes("--list")) {
    return false;
  }
  if (rest.some((token) => QA_DIR_TOKEN.test(token) || namesEnvFile(token)) || !hasSuiteConfig(rest, config)) {
    return false;
  }
  if (rest.filter((token) => REPORTER_FLAG.test(token)).length !== 1) {
    return false;
  }
  return rest
    .filter((token) => !isConfigFlag(token))
    .every((token) =>
      token.startsWith("-") ? PLAYWRIGHT_FLAGS.some((flag) => flag.test(token)) : PLAYWRIGHT_PATH.test(token),
    );
}

function isProveFailsCall(tokens: readonly string[]): boolean {
  const [, , spec = "", line = "", ...rest] = tokens;
  const flags = rest.filter((token) => token.startsWith("-"));
  const words = rest.filter((token) => !token.startsWith("-"));
  return (
    PLAYWRIGHT_PATH.test(spec) &&
    !spec.startsWith("-") &&
    !spec.startsWith("/") &&
    !spec.split("/").includes("..") &&
    !namesEnvFile(spec) &&
    /^\d+$/.test(line) &&
    words.length > 0 &&
    flags.length <= 1 &&
    flags.every((flag) => PROVE_FAILS_PROJECT.test(flag))
  );
}

function isQualityCall(tokens: readonly string[]): boolean {
  const [, module, ...args] = tokens;
  const count = module === TEST_SHAPE_PATH ? args.length > 0 : TEST_DURATION_ARGUMENTS.includes(args.length);
  return count && args.every(isRepoPath);
}

function isQaModule(tokens: readonly string[], agent: string | undefined): boolean {
  const pattern = bareName(agent) === JUDGE_AGENT ? JUDGE_QA_MODULE_PATH : QA_MODULE_PATH;
  if (tokens[0] !== "node" || !pattern.test(tokens[1] ?? "")) {
    return false;
  }
  if (tokens[1] === TEST_SHAPE_PATH || tokens[1] === TEST_DURATION_PATH) {
    return isQualityCall(tokens);
  }
  return tokens[1] !== PROVE_FAILS_PATH || isProveFailsCall(tokens);
}

function outputPatternOf(agent: string | undefined): RegExp | undefined {
  const bare = bareName(agent);
  if (bare === REVIEWER_AGENT) {
    return REVIEWER_OUTPUT;
  }
  return bare === HEALER_AGENT ? HEALER_REVIEW_OUTPUT : undefined;
}

function withoutOutputAssignment(tokens: readonly string[], agent: string | undefined): readonly string[] | undefined {
  const [first = ""] = tokens;
  if (!first.startsWith(OUTPUT_VARIABLE)) {
    return tokens;
  }
  return outputPatternOf(agent)?.test(first) === true ? tokens.slice(1) : undefined;
}

/**
 * True only for a single plain command on the allowlist: `npx --no playwright test --config=<suiteDir> --list
 * --reporter=json|list|null …` (`--repeat-each=<1-2 digits>` allowed there, so a reviewer can list a series; the
 * config flag exactly as `config` holds it, none for a suite at the repository root, and no path to a `.env` file),
 * `git diff|log|show|status …`, `node .claude/checks/<module>.mts …` (`test-shape` and `test-duration` only with
 * repository paths and a project name, as 1+ and 2-3 arguments); `qa-judge` also has `judge-verdict` and
 * `prove-fails`. `npx` must carry `--no`, optionally then `--` (npm 12 needs it before a tool whose next word is a
 * flag), so npm never fetches a package. Only `qa-reviewer` may lead the listing with
 * `PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/<contract-name>/review-list.<project>.json`, `<contract-name>` not starting
 * with `heal-`, and `qa-healer` only with the directory `heal-<slug>`. No chaining, substitution, redirection, quoting,
 * globbing or variable expansion.
 *
 * @param config the suite's Playwright config arguments (`playwrightConfigArgs`); undefined blocks every Playwright
 * command.
 */
export function isReadOnlyCommand(command: string, agent: string | undefined, config: SuiteConfig): boolean {
  const text = command.trim();
  if (text === "") {
    return false;
  }
  const tokens = text.split(" ");
  if (!tokens.every((token) => TOKEN.test(token))) {
    return false;
  }
  const bare = withoutOutputAssignment(tokens, agent);
  if (bare === undefined) {
    return false;
  }
  if (bare !== tokens) {
    return isPlaywrightList(bare, config);
  }
  if (tokens[0] === "git") {
    return isGitRead(tokens);
  }
  if (tokens[0] === NPX) {
    return isPlaywrightList(tokens, config);
  }
  return isQaModule(tokens, agent);
}

function isRepoPath(token: string): boolean {
  return (
    PLAYWRIGHT_PATH.test(token) &&
    !token.startsWith("-") &&
    !token.startsWith("/") &&
    !DRIVE_PATH.test(token) &&
    !token.split("/").includes("..") &&
    !namesEnvFile(token)
  );
}

function isHealerPlaywright(tokens: readonly string[], config: SuiteConfig): boolean {
  const [tool, subcommand, ...rest] = npxArgs(tokens) ?? [];
  if (tool !== "playwright" || subcommand !== "test" || !hasSuiteConfig(rest, config)) {
    return false;
  }
  let reporters = 0;
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] ?? "";
    if (isConfigFlag(token)) {
    } else if (token === "-g") {
      index += 1;
      if (!GREP_VALUE.test(rest[index] ?? "")) {
        return false;
      }
    } else if (token === "--list") {
    } else if (token.startsWith("--reporter=")) {
      reporters += 1;
      if (reporters > 1 || !HEALER_REPORTER.test(token)) {
        return false;
      }
    } else if (token.startsWith("-")) {
      if (!HEALER_PLAYWRIGHT_FLAGS.some((flag) => flag.test(token))) {
        return false;
      }
    } else if (!isRepoPath(token)) {
      return false;
    }
  }
  return true;
}

function isTypecheck(args: readonly string[], config: SuiteConfig): boolean {
  if (args.length === 1) {
    return args[0] === NO_EMIT;
  }
  const suiteDir = config?.[0]?.slice(CONFIG_PREFIX.length);
  return suiteDir !== undefined && args.length === 3 && args[0] === "-p" && args[1] === suiteDir && args[2] === NO_EMIT;
}

/**
 * True only for a single plain command the healer may run besides the read-only ones: `npx --no playwright test
 * --config=<suiteDir>` (the config flag exactly as `config` holds it) on repository paths with `--project`,
 * `--repeat-each`, `--retries=0`, `--reporter=list|json|null`, `--grep` or `-g` and `--list`, optionally led by
 * `PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-<slug>/<name>.json`; `node .claude/checks/expectation-guard.mts
 * --snapshot|--base=<sha>`; `npx --no tsc --noEmit` and, for a suite in a directory, `npx --no tsc -p <suiteDir>
 * --noEmit`; `npx --no biome check <paths>` with no flag. No path names a `.env` file. Nothing that fetches a package,
 * writes to git, updates snapshots, picks another config or an output directory, and not the main session's
 * `--repo-fingerprint`.
 */
export function isHealerCommand(command: string, config: SuiteConfig): boolean {
  const text = command.trim();
  const tokens = text.split(" ");
  if (text === "" || !tokens.every((token) => TOKEN.test(token))) {
    return false;
  }
  const [first = "", second, third, ...rest] = tokens;
  if (first.startsWith(OUTPUT_VARIABLE)) {
    return HEAL_JSON_OUTPUT.test(first) && isHealerPlaywright(tokens.slice(1), config);
  }
  if (first === "node") {
    return (
      second === GUARD_PATH &&
      rest.length === 0 &&
      third !== undefined &&
      (third === "--snapshot" || GUARD_BASE.test(third))
    );
  }
  const [tool, subcommand, ...args] = npxArgs(tokens) ?? [];
  if (tool === "playwright") {
    return isHealerPlaywright(tokens, config);
  }
  if (tool === "tsc") {
    return isTypecheck([subcommand ?? "", ...args], config);
  }
  if (tool === "biome") {
    return subcommand === "check" && args.length > 0 && args.every(isRepoPath);
  }
  return false;
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

function hasShortName(path: string): boolean {
  return path.split(PATH_SEPARATORS).some((segment) => SHORT_NAME_SEGMENT.test(segment));
}

function pathInside(projectDir: string, dir: string, file: string): string[] | undefined {
  const requested = resolve(projectDir, file);
  const area = realPathOf(resolve(projectDir, dir));
  const target = realPathOf(requested);
  if (area === undefined || target === undefined || hasShortName(relative(projectDir, requested))) {
    return undefined;
  }
  const path = relative(area, target);
  if (path === "" || path.startsWith("..") || isAbsolute(path) || hasShortName(path)) {
    return undefined;
  }
  return path.split(PATH_SEPARATORS);
}

function isReportFile(segments: readonly string[]): boolean {
  return segments.length === 1 && REPORT_FILE.test(segments[0] ?? "");
}

function isCoverageFile(segments: readonly string[]): boolean {
  return segments.length === 1 && COVERAGE_FILE.test(segments[0] ?? "");
}

function isJudgeFile(segments: readonly string[]): boolean {
  return segments.length >= 2 && JUDGE_FILE.test(segments.at(-1) ?? "") && !segments.some((name) => name.includes(":"));
}

function writeRuleOf(
  agent: string,
): { dir: string; allows: (segments: readonly string[]) => boolean; shown: string } | undefined {
  const bare = bareName(agent);
  if (bare === JUDGE_AGENT) {
    return {
      dir: JUDGE_WRITE_DIR,
      allows: isJudgeFile,
      shown: `only .json files under ${JUDGE_WRITE_DIR}/<contract-name>/`,
    };
  }
  if (bare === EXPLORER_AGENT) {
    return { dir: EXPLORER_WRITE_DIR, allows: isReportFile, shown: `only ${EXPLORER_WRITE_DIR}/explore-<slug>.md` };
  }
  if (bare === COVERAGE_AGENT) {
    return {
      dir: EXPLORER_WRITE_DIR,
      allows: isCoverageFile,
      shown: `only ${EXPLORER_WRITE_DIR}/coverage-<yyyy-mm-dd>[-<slug>].md`,
    };
  }
  return undefined;
}

function writeBlockReason(agent: string, toolInput: unknown, projectDir: string): string | undefined {
  const rule = writeRuleOf(agent);
  if (rule === undefined) {
    return `${agent} is read-only and may not write files; blocked`;
  }
  const file = isRecord(toolInput) ? toolInput["file_path"] : undefined;
  const segments = typeof file === "string" && file !== "" ? pathInside(projectDir, rule.dir, file) : undefined;
  if (segments !== undefined && rule.allows(segments)) {
    const content = isRecord(toolInput) ? toolInput["content"] : undefined;
    return bareName(agent) === EXPLORER_AGENT && typeof content === "string" && CREDENTIAL_SHAPE.test(content)
      ? `${agent} may not write a token, password or Bearer header into a report; blocked`
      : undefined;
  }
  const shown = JSON.stringify(typeof file === "string" ? file.slice(0, MAX_SHOWN_COMMAND) : null);
  return `${agent} may write ${rule.shown}; blocked: ${shown}`;
}

function cleanHealerSegments(segments: readonly string[] | undefined): readonly string[] | undefined {
  const bad = segments?.some((name) => {
    const lower = name.toLowerCase();
    const windowsName = lower.replace(WINDOWS_TRAILING, "");
    return (
      name.includes(":") ||
      lower.startsWith(".git") ||
      windowsName === ".claude" ||
      ENV_FILE_NAME.test(windowsName) ||
      /~\d/.test(name)
    );
  });
  return bad === false ? segments : undefined;
}

function healerPathsOf(projectDir: string): readonly string[] | undefined {
  try {
    return readProjectFactsIn(projectDir).healerPaths;
  } catch {
    return undefined;
  }
}

function suiteConfigOf(projectDir: string): SuiteConfig {
  try {
    return playwrightConfigArgs(readProjectFactsIn(projectDir).suiteDir);
  } catch {
    return undefined;
  }
}

function playwrightShown(config: SuiteConfig): string {
  return config === undefined
    ? `npx --no playwright test (not now: ${PROJECT_FACTS_PATH} could not be read)`
    : ["npx --no playwright test", ...config].join(" ");
}

function typecheckShown(config: SuiteConfig): string {
  const suiteDir = config?.[0]?.slice(CONFIG_PREFIX.length);
  return suiteDir === undefined
    ? `npx --no tsc ${NO_EMIT}`
    : `npx --no tsc ${NO_EMIT}, npx --no tsc -p ${suiteDir} ${NO_EMIT}`;
}

function healerMayWrite(file: string, projectDir: string, healerPaths: readonly string[]): boolean {
  if (healerPaths.some((dir) => cleanHealerSegments(pathInside(projectDir, dir, file)) !== undefined)) {
    return true;
  }
  const report = cleanHealerSegments(pathInside(projectDir, EXPLORER_WRITE_DIR, file));
  if (report?.length === 1 && HEAL_REPORT.test(report[0] ?? "")) {
    return true;
  }
  const run = cleanHealerSegments(pathInside(projectDir, HEALER_RUN_DIR, file));
  return run !== undefined && run.length >= 2 && HEAL_SLUG.test(run[0] ?? "");
}

/**
 * The directory git runs hooks from (`core.hooksPath`, else `.git/hooks`), resolved by git itself. Outside a repository
 * there is none (`NO_HOOKS_DIR`); a repository whose configuration git cannot read gives undefined, which blocks.
 */
function hooksDirOf(projectDir: string): string | undefined {
  try {
    return execFileSync("git", GIT_HOOKS_DIR_ARGS, {
      cwd: projectDir,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return exists(join(projectDir, GIT_DIR)) ? undefined : NO_HOOKS_DIR;
  }
}

function isInsideHooksDir(file: string, projectDir: string, hooksDir: string): boolean {
  return hooksDir !== NO_HOOKS_DIR && pathInside(projectDir, hooksDir, file) !== undefined;
}

function healerWriteBlockReason(agent: string, toolInput: unknown, projectDir: string): string | undefined {
  const file = isRecord(toolInput) ? toolInput["file_path"] : undefined;
  const shown = JSON.stringify(typeof file === "string" ? file.slice(0, MAX_SHOWN_COMMAND) : null);
  const healerPaths = healerPathsOf(projectDir);
  if (healerPaths === undefined) {
    return `${agent} may not write: ${PROJECT_FACTS_PATH} could not be read; blocked: ${shown}`;
  }
  const hooksDir = hooksDirOf(projectDir);
  if (hooksDir === undefined) {
    return `${agent} may not write: the git hooks directory could not be resolved; blocked: ${shown}`;
  }
  if (typeof file === "string" && file !== "" && isInsideHooksDir(file, projectDir, hooksDir)) {
    return `${agent} may not write into the directory git runs hooks from; blocked: ${shown}`;
  }
  if (typeof file === "string" && file !== "" && healerMayWrite(file, projectDir, healerPaths)) {
    return undefined;
  }
  return `${agent} may write only under its healer paths, ${EXPLORER_WRITE_DIR}/heal-<slug>.md, ${EXPLORER_WRITE_DIR}/flaky.md and ${HEALER_RUN_DIR}/heal-<slug>/; blocked: ${shown}`;
}

function healerBlockReason(agent: string, tool: unknown, toolInput: unknown, projectDir: string): string | undefined {
  if (tool !== undefined && typeof tool !== "string") {
    return `${agent} is restricted and its tool could not be identified; blocked`;
  }
  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit") {
    return healerWriteBlockReason(agent, toolInput, projectDir);
  }
  if (tool === "NotebookEdit" || tool === "PowerShell") {
    return `${agent} may not use ${tool}; blocked`;
  }
  if (typeof tool === "string" && tool.startsWith("mcp__")) {
    return browserBlockReason(agent, tool, toolInput, projectDir);
  }
  if (tool !== undefined && tool !== "Bash") {
    return undefined;
  }
  const command = isRecord(toolInput) ? toolInput["command"] : undefined;
  const config = suiteConfigOf(projectDir);
  if (typeof command === "string" && (isReadOnlyCommand(command, agent, config) || isHealerCommand(command, config))) {
    return undefined;
  }
  const shown = JSON.stringify(typeof command === "string" ? command.slice(0, MAX_SHOWN_COMMAND) : null);
  return `${agent} may run only git diff|log|show|status, node ${CHECKS_DIR}/<module>.mts, ${playwrightShown(config)} <specs> with --project, --repeat-each, --retries=0, --reporter, -g and --list, node ${GUARD_PATH} --snapshot|--base=<sha>, ${typecheckShown(config)} and npx --no biome check <paths>, never on a .env file; blocked: ${shown}`;
}

function isWebUrl(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  try {
    return WEB_PROTOCOLS.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isShippedExtractor(script: unknown): boolean {
  return typeof script === "string" && EXTRACTORS.includes(script.trim());
}

function standOriginList(projectDir: string): string[] | string {
  try {
    return Object.values(standOrigins(runVariables(projectDir)));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function signInSecretNames(projectDir: string): string[] {
  try {
    return passwordNames(readProjectFactsIn(projectDir).passwordFor);
  } catch {
    return [];
  }
}

function openBlockReason(agent: string, tool: string, url: unknown, projectDir: string): string | undefined {
  if (!isWebUrl(url)) {
    return `${agent} may open only http or https addresses in ${tool}; blocked`;
  }
  const origins = standOriginList(projectDir);
  if (typeof origins === "string") {
    return `${agent} may open only the stand, whose origins are unknown (${origins}); blocked`;
  }
  const origin = new URL(String(url)).origin;
  return origins.includes(origin)
    ? undefined
    : `${agent} may open only the stand (${origins.join(", ")}), not ${origin}; blocked`;
}

function browserBlockReason(agent: string, tool: string, toolInput: unknown, projectDir: string): string | undefined {
  if (!BROWSER_TOOLS.includes(tool)) {
    return `${agent} is read-only and may not use ${tool}; blocked`;
  }
  if (toolInput !== undefined && toolInput !== null && !isRecord(toolInput)) {
    return `${agent} may call ${tool} only with named arguments; blocked`;
  }
  const input = isRecord(toolInput) ? toolInput : {};
  const name = tool.slice(BROWSER_TOOL_PREFIX.length);
  const extra = Object.keys(input).find((key) => !(BROWSER_TOOL_KEYS[name] ?? []).includes(key));
  if (extra !== undefined) {
    return `${agent} may not pass ${JSON.stringify(extra.slice(0, MAX_SHOWN_COMMAND))} to ${tool}; blocked`;
  }
  if (name === "network_request" && (bareName(agent) !== EXPLORER_AGENT || input["part"] !== RESPONSE_BODY)) {
    return `${agent} may read only part "${RESPONSE_BODY}" of a request in ${tool}, and only as ${EXPLORER_AGENT}; blocked`;
  }
  if (name === "evaluate" && !isShippedExtractor(input["function"])) {
    return `${agent} may run only the shipped page extractor in ${tool}; blocked`;
  }
  if (name === "type" && input["submit"] !== undefined && input["submit"] !== false) {
    const text = input["text"];
    if (typeof text !== "string" || !signInSecretNames(projectDir).includes(text)) {
      return `${agent} may type with submit in ${tool} only a password name from passwordFor, to sign in; blocked`;
    }
  }
  if (name === "navigate" || (name === "tabs" && input["url"] !== undefined)) {
    return openBlockReason(agent, tool, input["url"], projectDir);
  }
  return undefined;
}

/**
 * Decides a PreToolUse hook call for the Bash, Write and Playwright browser tools: a one-line reason to block it, or
 * undefined to let it pass. Only the read-only agents are limited; the main session and every other agent pass
 * untouched. A read-only agent's Bash call must be on the allowlist, its Playwright commands with the suite's config
 * arguments from the project facts (`suiteDir`). Its Write call is allowed for `qa-judge` only as a `.json` file under
 * `.qa/judge/<contract-name>/`, for `qa-explorer` only as `.qa/reports/explore-<slug>.md` and for `qa-coverage` only
 * as `.qa/reports/coverage-<yyyy-mm-dd>[-<slug>].md`, all under the
 * real path of the project directory (a link that leaves it does not count). The other writing tools are blocked, and
 * so is every `mcp__` tool but the fixed list of `mcp__playwright__browser_*` tools: `browser_evaluate` runs only the
 * shipped page extractor, `browser_type` submits only a password name from `passwordFor` (a sign-in),
 * `browser_navigate` and a new tab open only the stand's origins (`stand.mts`),
 * `browser_network_request` is the explorer's only and reads only a response body. The tools that
 * only read pass.
 */
export function hookBlockReason(input: unknown, projectDir: string = process.cwd()): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  const agent = input["agent_type"];
  if (typeof agent === "string" && bareName(agent) === HEALER_AGENT) {
    return healerBlockReason(agent, input["tool_name"], input["tool_input"], projectDir);
  }
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
  if (typeof tool === "string" && tool.startsWith("mcp__")) {
    return browserBlockReason(agent, tool, toolInput, projectDir);
  }
  if (tool !== undefined && tool !== "Bash") {
    return undefined;
  }
  const command = isRecord(toolInput) ? toolInput["command"] : undefined;
  const config = suiteConfigOf(projectDir);
  if (typeof command === "string" && isReadOnlyCommand(command, agent, config)) {
    return undefined;
  }
  const shown = JSON.stringify(typeof command === "string" ? command.slice(0, MAX_SHOWN_COMMAND) : null);
  return `${agent} is read-only and may run only git diff|log|show|status, ${playwrightShown(config)} --list --reporter=json|list|null and node ${CHECKS_DIR}/<module>.mts, never on a .env file; blocked: ${shown}`;
}
