import type { JudgeRole } from "../qa/judge-verdict.mts";
import type { EvalCase, EvalResult, LoadedCase, Role } from "./case.mts";
import type { Baseline, CheckContext, Invocation, Outcome, Spawner } from "./checks.mts";

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { checkJudgeVerdict, criteriaOf, JUDGE_ROLES } from "../qa/judge-verdict.mts";
import { loadCases } from "./case.mts";
import { runCodeCheck } from "./checks.mts";

export type { Invocation, Outcome, Spawner } from "./checks.mts";

export type RunContext = {
  root: string;
  spawn: Spawner;
  today: string;
  claude: string;
  agentTimeoutMs: number;
};

type AgentRun = { ok: boolean; text: string; note: string };

type JudgeRun = { judge: Record<string, boolean>; failures: string[] };

const CLI_FILE_NAME = "run.mts";
const USAGE = "evals: usage is node evals/run.mts --cases <glob> [--out <file>] [--offline]";
const AGENTS: Readonly<Record<Role, string>> = {
  planner: "qa-planner",
  expert: "qa-automation-expert",
  explorer: "qa-explorer",
  healer: "qa-healer",
  reviewer: "qa-reviewer",
  coverage: "qa-coverage",
};
const JUDGE_AGENT = "qa-judge";
const CRITERIA_DIR = ".claude/skills/judge-criteria";
const JUDGE_DIR = ".qa/judge";
const AGENT_RUN_CHECK = "agent-run";
const WORKTREE_PREFIX = "qa-eval-";
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;
const GIT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BUFFER = 256 * 1024 * 1024;
const MAX_EVIDENCE = 2000;
const ENV_FILE = /^\.env(\..+)?$/;
const ENV_EXAMPLE = ".env.example";
const BASELINE_PLACEHOLDER = "{{BASELINE}}";
const DATE_PLACEHOLDER = "{{DATE}}";
const ALLOWED_TOOLS = [
  "Read",
  "Grep",
  "Glob",
  "Write",
  "Edit",
  "Skill",
  "Bash(node qa/*)",
  "Bash(git diff*)",
  "Bash(git status*)",
  "Bash(git log*)",
  "Bash(git show*)",
  "Bash(npx --no*)",
  "Bash(npm run*)",
  "Bash(PLAYWRIGHT_JSON_OUTPUT_FILE=*)",
  "mcp__playwright__*",
].join(",");

function isJudgeRole(role: Role): role is JudgeRole {
  return JUDGE_ROLES.some((judged) => judged === role);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs a command and waits; a timeout or a missing program is a `null` status with the reason in `stderr`. */
export function spawnReal(invocation: Invocation): Outcome {
  const result = spawnSync(invocation.file, invocation.args, {
    cwd: invocation.cwd,
    shell: invocation.shell ?? false,
    encoding: "utf8",
    timeout: invocation.timeoutMs ?? GIT_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    ...(invocation.input === undefined ? {} : { input: invocation.input }),
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: `${result.stderr ?? ""}${result.error === undefined ? "" : `\n${result.error.message}`}`,
  };
}

function fill(text: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce((filled, [name, value]) => filled.split(name).join(value), text);
}

function git(context: RunContext, args: string[], cwd: string): Outcome {
  return context.spawn({ file: "git", args, cwd });
}

function mustGit(context: RunContext, args: string[], cwd: string): string {
  const outcome = git(context, args, cwd);
  if (outcome.status !== 0) {
    throw new Error(`git ${args.slice(0, 2).join(" ")} failed: ${outcome.stderr.trim() || outcome.stdout.trim()}`);
  }
  return outcome.stdout;
}

function linkEnvironment(root: string, worktree: string): void {
  const modules = join(root, "node_modules");
  if (existsSync(modules)) {
    symlinkSync(modules, join(worktree, "node_modules"), "junction");
  }
  for (const name of readdirSync(root)) {
    if (ENV_FILE.test(name) && name !== ENV_EXAMPLE && statSync(join(root, name)).isFile()) {
      copyFileSync(join(root, name), join(worktree, name));
    }
  }
}

function unlinkQuietly(path: string): boolean {
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

function removeWorktree(context: RunContext, worktree: string): void {
  unlinkQuietly(join(worktree, "node_modules"));
  git(context, ["worktree", "remove", "--force", worktree], context.root);
  rmSync(worktree, { recursive: true, force: true });
  git(context, ["worktree", "prune"], context.root);
}

function applyPatch(context: RunContext, patch: string, worktree: string): void {
  mustGit(context, ["apply", "--whitespace=nowarn", patch], worktree);
  mustGit(context, ["add", "--all"], worktree);
  mustGit(
    context,
    [
      "-c",
      "user.name=evals",
      "-c",
      "user.email=evals@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--no-verify",
      "--allow-empty",
      "-m",
      "evaluation starting state",
    ],
    worktree,
  );
}

function recordBaseline(context: RunContext, worktree: string): Baseline {
  const read = (flag: string): string => {
    const outcome = context.spawn({ file: "node", args: ["qa/expectation-guard.mts", flag], cwd: worktree });
    if (outcome.status !== 0 || outcome.stdout.trim() === "") {
      throw new Error(`expectation-guard ${flag} failed: ${outcome.stderr.trim()}`);
    }
    return outcome.stdout.trim();
  };
  return { tree: read("--snapshot"), fingerprint: read("--repo-fingerprint") };
}

function agentArguments(agent: string): string[] {
  return [
    "-p",
    "--agent",
    agent,
    "--output-format",
    "json",
    "--permission-mode",
    "acceptEdits",
    "--permission-prompts",
    "none",
    "--no-session-persistence",
    "--setting-sources",
    "project",
    "--allowedTools",
    ALLOWED_TOOLS,
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runAgent(context: RunContext, agent: string, prompt: string, worktree: string): AgentRun {
  const outcome = context.spawn({
    file: context.claude,
    args: agentArguments(agent),
    cwd: worktree,
    input: prompt,
    timeoutMs: context.agentTimeoutMs,
  });
  let json: unknown;
  try {
    json = JSON.parse(outcome.stdout.trim());
  } catch {
    return { ok: false, text: "", note: `${agent} gave no JSON (exit ${outcome.status}): ${outcome.stderr.trim()}` };
  }
  if (!isRecord(json) || typeof json["result"] !== "string") {
    return { ok: false, text: "", note: `${agent} gave JSON with no result` };
  }
  if (outcome.status !== 0 || json["is_error"] === true) {
    return { ok: false, text: json["result"], note: `${agent} ended in an error: ${json["result"].slice(0, 300)}` };
  }
  const cost = typeof json["total_cost_usd"] === "number" ? ` (cost ${json["total_cost_usd"]} USD)` : "";
  return { ok: true, text: json["result"], note: `${agent} finished${cost}` };
}

function fillCase(evalCase: EvalCase, values: Readonly<Record<string, string>>): EvalCase {
  return {
    ...evalCase,
    prompt: fill(evalCase.prompt, values),
    judgeCriteria: evalCase.judgeCriteria.map((point) => fill(point, values)),
    ...(evalCase.output === undefined ? {} : { output: fill(evalCase.output, values) }),
    ...(evalCase.contract === undefined ? {} : { contract: fill(evalCase.contract, values) }),
  };
}

function judgePrompt(evalCase: EvalCase, role: JudgeRole): string {
  const under = evalCase.output ?? "the changes in the working tree (git status, git diff, new files included)";
  const lines = [
    `Judge the work of the ${role} for the evaluation case ${evalCase.id}.`,
    `Role: ${role}`,
    `Output under judgement: ${under}`,
    ...(evalCase.contract === undefined ? [] : [`Contract: ${evalCase.contract}`]),
    `Write your verdict to ${JUDGE_DIR}/eval-${evalCase.id}/judge-${role}.json`,
  ];
  if (evalCase.judgeCriteria.length > 0) {
    lines.push(
      "Case-specific points. Apply each within the criterion of the role it belongs to, and fail that criterion when the point is not met:",
      ...evalCase.judgeCriteria.map((point) => `- ${point}`),
    );
  }
  return `${lines.join("\n")}\n`;
}

function allFailed(role: JudgeRole, worktree: string): Record<string, boolean> {
  let names: string[];
  try {
    names = criteriaOf(role, join(worktree, CRITERIA_DIR));
  } catch {
    names = [];
  }
  return Object.fromEntries(names.map((name) => [name, false]));
}

function runJudge(context: RunContext, evalCase: EvalCase, role: JudgeRole, worktree: string): JudgeRun {
  const run = runAgent(context, JUDGE_AGENT, judgePrompt(evalCase, role), worktree);
  const file = join(worktree, JUDGE_DIR, `eval-${evalCase.id}`, `judge-${role}.json`);
  if (!run.ok) {
    return { judge: allFailed(role, worktree), failures: [`judge: ${run.note}`] };
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { judge: allFailed(role, worktree), failures: ["judge: wrote no readable verdict file"] };
  }
  const problems = checkJudgeVerdict(json, role, join(worktree, CRITERIA_DIR));
  if (problems.length > 0 || !isRecord(json) || !Array.isArray(json["criteria"])) {
    return { judge: allFailed(role, worktree), failures: problems.map((line) => `judge: ${line}`) };
  }
  const answers = json["criteria"].flatMap((entry) =>
    isRecord(entry) && typeof entry["name"] === "string" && typeof entry["pass"] === "boolean"
      ? [{ name: entry["name"], pass: entry["pass"], evidence: String(entry["evidence"] ?? "") }]
      : [],
  );
  return {
    judge: Object.fromEntries(answers.map(({ name, pass }) => [name, pass])),
    failures: answers.filter(({ pass }) => !pass).map(({ name, evidence }) => `judge ${name}: ${evidence}`),
  };
}

function execute(loaded: LoadedCase, worktree: string, context: RunContext): EvalResult {
  mustGit(context, ["worktree", "add", "--detach", worktree, loaded.evalCase.startRef], context.root);
  linkEnvironment(context.root, worktree);
  if (loaded.evalCase.patch !== undefined) {
    applyPatch(context, join(loaded.dir, loaded.evalCase.patch), worktree);
  }
  const baseline = loaded.evalCase.codeChecks.includes("expectation-guard")
    ? recordBaseline(context, worktree)
    : undefined;
  const evalCase = fillCase(loaded.evalCase, {
    [DATE_PLACEHOLDER]: context.today,
    [BASELINE_PLACEHOLDER]: baseline?.tree ?? "",
  });
  const agent = runAgent(context, AGENTS[evalCase.role], evalCase.prompt, worktree);
  const notes: string[] = [];
  const codeChecks: Record<string, boolean> = { [AGENT_RUN_CHECK]: agent.ok };
  if (!agent.ok) {
    notes.push(agent.note);
  }
  const checkContext: CheckContext = { evalCase, worktree, spawn: context.spawn, agentText: agent.text, baseline };
  for (const name of evalCase.codeChecks) {
    if (agent.ok) {
      const outcome = runCodeCheck(name, checkContext);
      codeChecks[name] = outcome.pass;
      if (!outcome.pass) {
        notes.push(outcome.note);
      }
    } else {
      codeChecks[name] = false;
    }
  }
  let judge: Record<string, boolean> = {};
  if (agent.ok && isJudgeRole(evalCase.role)) {
    const judged = runJudge(context, evalCase, evalCase.role, worktree);
    judge = judged.judge;
    notes.push(...judged.failures);
  }
  return { caseId: evalCase.id, codeChecks, judge, evidence: notes.join("\n").slice(0, MAX_EVIDENCE) };
}

/**
 * Runs one case: a throw-away git worktree at the case's `startRef` under the system temporary directory (removed on
 * every path), the case's patch committed as its starting state, the role run headless, the code checks, then
 * `qa-judge` on what code cannot decide. A case that cannot run is a result with a failed `agent-run`, never a throw.
 */
export function runCase(loaded: LoadedCase, context: RunContext): EvalResult {
  const worktree = mkdtempSync(join(tmpdir(), WORKTREE_PREFIX));
  try {
    return execute(loaded, worktree, context);
  } catch (error) {
    return {
      caseId: loaded.evalCase.id,
      codeChecks: { [AGENT_RUN_CHECK]: false },
      judge: {},
      evidence: errorText(error).slice(0, MAX_EVIDENCE),
    };
  } finally {
    removeWorktree(context, worktree);
  }
}

function flagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

function packageVersion(root: string): string {
  const json: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return isRecord(json) && typeof json["version"] === "string" ? json["version"] : "unversioned";
}

function summary(result: EvalResult): string {
  const failedChecks = Object.entries(result.codeChecks).filter(([, passed]) => !passed);
  const judged = Object.values(result.judge);
  const judgeText = judged.length === 0 ? "no judge" : `judge ${judged.filter(Boolean).length}/${judged.length}`;
  return `${result.caseId}: ${failedChecks.length === 0 ? "code ok" : `code FAILED (${failedChecks.map(([name]) => name).join(", ")})`}, ${judgeText}`;
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const args = process.argv.slice(2);
    const pattern = flagValue(args, "--cases");
    if (pattern === undefined) {
      throw new Error(USAGE);
    }
    const root = resolve(".");
    const out = flagValue(args, "--out") ?? join("evals", "results", `${packageVersion(root)}.json`);
    const offline = args.includes("--offline");
    const context: RunContext = {
      root,
      spawn: spawnReal,
      today: new Date().toISOString().slice(0, 10),
      claude: process.env["CLAUDE_BIN"] ?? "claude",
      agentTimeoutMs: DEFAULT_AGENT_TIMEOUT_MS,
    };
    const loaded = loadCases(pattern, root).filter(({ evalCase }) => !(offline && evalCase.needsStand === true));
    const results: EvalResult[] = [];
    for (const entry of loaded) {
      const result = runCase(entry, context);
      results.push(result);
      process.stdout.write(`${summary(result)}\n`);
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
    process.stdout.write(`results: ${out}\n`);
    process.exitCode = results.some(({ codeChecks }) => Object.values(codeChecks).includes(false)) ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${errorText(error)}\n`);
    process.exitCode = 1;
  }
}
