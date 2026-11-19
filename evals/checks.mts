import type { Dirent } from "node:fs";
import type { CodeCheck, EvalCase } from "./case.mts";

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { PROJECT_FACTS_PATH, readProjectFacts } from "../qa/project-facts.mts";

export type Invocation = {
  file: string;
  args: string[];
  cwd: string;
  shell?: boolean;
  timeoutMs?: number;
  input?: string;
};

export type Outcome = { status: number | null; stdout: string; stderr: string };

export type Spawner = (invocation: Invocation) => Outcome;

export type Baseline = { tree: string; fingerprint: string };

export type CheckContext = {
  evalCase: EvalCase;
  worktree: string;
  spawn: Spawner;
  agentText: string;
  baseline: Baseline | undefined;
};

export type CheckOutcome = { pass: boolean; note: string };

const GUARD_FILES = ["expectation-guard", "project-facts"] as const;
const QA_RUNS_DIR = ".qa/runs";
const NOTE_LINES = 3;
const VERDICT_WORD = /\b(?:APPROVE|REQUEST_CHANGES|NEEDS_DISCUSSION)\b/;
const GAPS_SUFFIX = "-gaps.md";
const RUN_LIST = /^list\.([\w-]+)\.json$/;
const UNNAMED_RUN_RECORD = /^(?:list|report)\.json$/;
const CONTRACT_EXTENSION = ".md";
const GUARD_TEMP_PREFIX = "eval-guard-";

function tail(outcome: Outcome): string {
  const lines = `${outcome.stdout}\n${outcome.stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-NOTE_LINES).join(" | ");
}

function succeeded(outcome: Outcome): boolean {
  return outcome.status === 0;
}

/** The markers of `defects` that the text does not contain; a marker with `|` counts when any alternative is there. */
export function missingDefects(text: string, defects: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return defects.filter(
    (defect) => !defect.split("|").some((alternative) => lower.includes(alternative.trim().toLowerCase())),
  );
}

function nodeModule(name: string, args: string[], context: CheckContext): Outcome {
  return context.spawn({ file: "node", args: [`qa/${name}.mts`, ...args], cwd: context.worktree });
}

function readCommand(kind: "typecheck" | "lint", context: CheckContext): string | CheckOutcome {
  try {
    return readProjectFacts(join(context.worktree, PROJECT_FACTS_PATH)).commands[kind];
  } catch (error) {
    return { pass: false, note: error instanceof Error ? error.message : String(error) };
  }
}

function snapshotTree(context: CheckContext): string | undefined {
  const outcome = nodeModule("expectation-guard", ["--snapshot"], context);
  const tree = outcome.stdout.trim();
  return succeeded(outcome) && tree !== "" ? tree : undefined;
}

function restoreTree(tree: string, changes: readonly string[], context: CheckContext): void {
  const kept: string[] = [];
  for (const line of changes) {
    const [status = "", ...rest] = line.split("\t");
    const path = rest.join("\t");
    if (status === "A") {
      rmSync(join(context.worktree, path), { force: true });
    } else {
      kept.push(path);
    }
  }
  if (kept.length > 0) {
    context.spawn({
      file: "git",
      args: ["restore", `--source=${tree}`, "--worktree", "--", ...kept],
      cwd: context.worktree,
    });
  }
}

function projectCommand(kind: "typecheck" | "lint", context: CheckContext): CheckOutcome {
  const command = readCommand(kind, context);
  if (typeof command !== "string") {
    return command;
  }
  const before = kind === "lint" ? snapshotTree(context) : undefined;
  if (kind === "lint" && before === undefined) {
    return { pass: false, note: "lint: the tree could not be snapshotted before the command" };
  }
  const outcome = context.spawn({ file: command, args: [], cwd: context.worktree, shell: true });
  if (before === undefined) {
    return { pass: succeeded(outcome), note: `${kind}: ${tail(outcome)}` };
  }
  const after = snapshotTree(context);
  if (after === before) {
    return { pass: succeeded(outcome), note: `lint: ${tail(outcome)}` };
  }
  if (after === undefined) {
    return { pass: false, note: "lint: the tree could not be snapshotted after the command" };
  }
  const diff = context.spawn({
    file: "git",
    args: ["diff-tree", "--no-renames", "-r", "--name-status", before, after],
    cwd: context.worktree,
  });
  const changes = diff.stdout.split(/\r?\n/).filter(Boolean);
  restoreTree(before, changes, context);
  const files = changes.map((line) => line.split("\t").slice(1).join("\t"));
  return { pass: false, note: `lint would rewrite: ${files.join(", ")}` };
}

function contractCheck(context: CheckContext): CheckOutcome {
  const { output } = context.evalCase;
  if (output === undefined) {
    return { pass: false, note: "contract: the case names no output file" };
  }
  const outcome = nodeModule("contract", ["check", output], context);
  return { pass: succeeded(outcome) && outcome.stdout.trim().startsWith("ok"), note: `contract: ${tail(outcome)}` };
}

function filesUnder(directory: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}

function reconcileCheck(context: CheckContext): CheckOutcome {
  const { contract } = context.evalCase;
  const runs =
    contract === undefined
      ? join(context.worktree, QA_RUNS_DIR)
      : join(context.worktree, QA_RUNS_DIR, basename(contract, CONTRACT_EXTENSION));
  const files = filesUnder(runs);
  const unnamed = files.filter((file) => UNNAMED_RUN_RECORD.test(basename(file)));
  if (unnamed.length > 0) {
    const names = unnamed.map((file) => file.slice(runs.length + 1)).join(", ");
    return { pass: false, note: `reconcile: a run record without its project in the name: ${names}` };
  }
  const lists = files.filter((file) => RUN_LIST.test(basename(file)));
  if (lists.length === 0) {
    return {
      pass: false,
      note: `reconcile: the run left no list.<project>.json under ${runs.slice(context.worktree.length + 1)}`,
    };
  }
  const notes: string[] = [];
  let pass = true;
  for (const list of lists) {
    const report = join(dirname(list), basename(list).replace(RUN_LIST, "report.$1.json"));
    const outcome = context.spawn({
      file: "node",
      args: ["qa/reconcile-run.mts", list, report],
      cwd: context.worktree,
    });
    pass = pass && succeeded(outcome);
    notes.push(`${list.slice(runs.length + 1)}: ${tail(outcome)}`);
  }
  return { pass, note: `reconcile: ${notes.join("; ")}` };
}

function plantedDefectsCheck(context: CheckContext): CheckOutcome {
  const missing = missingDefects(context.agentText, context.evalCase.plantedDefects ?? []);
  return {
    pass: missing.length === 0,
    note: missing.length === 0 ? "all planted defects named" : `missed: ${missing.join("; ")}`,
  };
}

function verdictCheck(context: CheckContext): CheckOutcome {
  const given = VERDICT_WORD.test(context.agentText);
  return { pass: given, note: given ? "a verdict is given" : "no verdict word" };
}

function guardCheck(context: CheckContext): CheckOutcome {
  const { baseline, worktree, spawn } = context;
  if (baseline === undefined) {
    return { pass: false, note: "expectation-guard: no baseline was recorded" };
  }
  const copy = mkdtempSync(join(tmpdir(), GUARD_TEMP_PREFIX));
  try {
    mkdirSync(join(copy, "qa"));
    for (const name of GUARD_FILES) {
      const blob = spawn({
        file: "git",
        args: ["-c", "core.fsmonitor=false", "cat-file", "blob", `${baseline.tree}:qa/${name}.mts`],
        cwd: worktree,
      });
      if (!succeeded(blob)) {
        return { pass: false, note: `expectation-guard: the baseline has no qa/${name}.mts` };
      }
      writeFileSync(join(copy, "qa", `${name}.mts`), blob.stdout);
    }
    const guard = join(copy, "qa", "expectation-guard.mts");
    const fingerprint = spawn({ file: "node", args: [guard, "--repo-fingerprint"], cwd: worktree });
    if (!succeeded(fingerprint) || fingerprint.stdout.trim() !== baseline.fingerprint) {
      return { pass: false, note: "expectation-guard: repository configuration changed" };
    }
    const outcome = spawn({ file: "node", args: [guard, `--base=${baseline.tree}`], cwd: worktree });
    return { pass: succeeded(outcome), note: `expectation-guard: ${succeeded(outcome) ? "clean" : tail(outcome)}` };
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

function rankedNames(stdout: string): string[] | undefined {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (!Array.isArray(json)) {
    return undefined;
  }
  return json.flatMap((gap) =>
    typeof gap === "object" && gap !== null && "name" in gap && typeof gap.name === "string" ? [gap.name] : [],
  );
}

function rankGapsCheck(context: CheckContext): CheckOutcome {
  const { output } = context.evalCase;
  if (output === undefined || !output.endsWith(".md")) {
    return { pass: false, note: "rank-gaps: the case names no report file" };
  }
  const outcome = nodeModule("rank-gaps", [`${output.slice(0, -".md".length)}${GAPS_SUFFIX}`], context);
  const names = succeeded(outcome) ? rankedNames(outcome.stdout) : undefined;
  if (names === undefined) {
    return { pass: false, note: `rank-gaps: ${tail(outcome)}` };
  }
  let report: string;
  try {
    report = readFileSync(join(context.worktree, output), "utf8");
  } catch {
    return { pass: false, note: `rank-gaps: ${output} was not written` };
  }
  let position = 0;
  for (const name of names) {
    const found = report.indexOf(name, position);
    if (found < 0) {
      return { pass: false, note: `rank-gaps: "${name}" is missing from the report or out of the ranked order` };
    }
    position = found + name.length;
  }
  return { pass: true, note: `rank-gaps: ${names.length} gaps in ranked order` };
}

/** Runs one code check in the case's worktree. A check that cannot run fails; it never passes by default. */
export function runCodeCheck(name: CodeCheck, context: CheckContext): CheckOutcome {
  switch (name) {
    case "typecheck":
    case "lint":
      return projectCommand(name, context);
    case "contract":
      return contractCheck(context);
    case "reconcile":
      return reconcileCheck(context);
    case "planted-defects":
      return plantedDefectsCheck(context);
    case "expectation-guard":
      return guardCheck(context);
    case "rank-gaps":
      return rankGapsCheck(context);
    case "verdict":
      return verdictCheck(context);
  }
}
