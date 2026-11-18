import { readFileSync } from "node:fs";
import { basename } from "node:path";

export type RunFailure = {
  test: string;
  project: string;
  why:
    | "failed"
    | "flaky"
    | "missing from the report"
    | "skipped without a reason"
    | "expected failure without a reason";
};

export type RunVerdict = {
  expected: number;
  passed: number;
  explainedSkips: number;
  failures: RunFailure[];
};

type Annotation = { type: string; description: string };

type Outcome = { status: string; expectedStatus: string; annotations: Annotation[] };

type Listed = { test: string; project: string };

const CLI_FILE_NAME = "reconcile-run.mts";
const TITLE_SEPARATOR = " › ";
const SKIP_ANNOTATIONS = ["skip", "fixme"];
const FAIL_ANNOTATIONS = ["fail"];
const KNOWN_ISSUE_ANNOTATION = "known issue";

function notPlaywrightJson(label: string): never {
  throw new Error(`reconcile: the ${label} is not Playwright JSON`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listOf(value: unknown, label: string): unknown[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : notPlaywrightJson(label);
}

function textOf(value: unknown, label: string): string {
  return typeof value === "string" ? value : notPlaywrightJson(label);
}

function annotationsOf(value: unknown, label: string): Annotation[] {
  return listOf(value, label).map((item) => {
    if (!isRecord(item)) {
      return notPlaywrightJson(label);
    }
    const description = item["description"];
    return { type: textOf(item["type"], label), description: typeof description === "string" ? description : "" };
  });
}

function walk(
  suite: unknown,
  titles: readonly string[],
  file: string,
  label: string,
  visit: (test: string, entry: Record<string, unknown>) => void,
): void {
  if (!isRecord(suite)) {
    notPlaywrightJson(label);
  }
  for (const spec of listOf(suite["specs"], label)) {
    if (!isRecord(spec)) {
      notPlaywrightJson(label);
    }
    const test = [file, ...titles, textOf(spec["title"], label)].join(TITLE_SEPARATOR);
    const entries = spec["tests"];
    if (!Array.isArray(entries)) {
      notPlaywrightJson(label);
    }
    for (const entry of entries) {
      if (!isRecord(entry)) {
        notPlaywrightJson(label);
      }
      visit(test, entry);
    }
  }
  for (const child of listOf(suite["suites"], label)) {
    if (!isRecord(child)) {
      notPlaywrightJson(label);
    }
    walk(child, [...titles, textOf(child["title"], label)], file, label, visit);
  }
}

function describeError(error: unknown): string {
  const message = isRecord(error) ? error["message"] : undefined;
  const text = typeof message === "string" ? message : JSON.stringify(error);
  return (text.trim().split("\n")[0] ?? "").trim();
}

function walkRoot(root: unknown, label: string, visit: (test: string, entry: Record<string, unknown>) => void): void {
  if (!isRecord(root) || !Array.isArray(root["suites"])) {
    throw new Error(`reconcile: the ${label} has no suites`);
  }
  const errors = listOf(root["errors"], label);
  if (errors.length > 0) {
    throw new Error(`reconcile: the ${label} has errors: ${errors.map(describeError).join("; ")}`);
  }
  for (const fileSuite of root["suites"]) {
    if (!isRecord(fileSuite)) {
      notPlaywrightJson(label);
    }
    const file = textOf(fileSuite["file"] ?? fileSuite["title"], label);
    walk(fileSuite, [], file, label, visit);
  }
}

function listedTests(listed: unknown): Listed[] {
  const tests: Listed[] = [];
  walkRoot(listed, "list", (test, entry) => {
    tests.push({ test, project: textOf(entry["projectName"], "list") });
  });
  return tests;
}

function key(test: string, project: string): string {
  return `${project}\u0000${test}`;
}

function reportedOutcomes(report: unknown): Map<string, Outcome[]> {
  const outcomes = new Map<string, Outcome[]>();
  walkRoot(report, "report", (test, entry) => {
    const id = key(test, textOf(entry["projectName"], "report"));
    outcomes.set(id, [
      ...(outcomes.get(id) ?? []),
      {
        status: textOf(entry["status"], "report"),
        expectedStatus: textOf(entry["expectedStatus"], "report"),
        annotations: annotationsOf(entry["annotations"], "report"),
      },
    ]);
  });
  return outcomes;
}

function isExplained(annotations: readonly Annotation[], types: readonly string[]): boolean {
  return annotations.some(
    ({ type, description }) => type === KNOWN_ISSUE_ANNOTATION || (types.includes(type) && description.trim() !== ""),
  );
}

type Judgement = { kind: "passed" } | { kind: "explained" } | { kind: "failure"; why: RunFailure["why"] };

function judge(outcome: Outcome): Judgement {
  if (outcome.status === "expected") {
    return outcome.expectedStatus === "failed" && !isExplained(outcome.annotations, FAIL_ANNOTATIONS)
      ? { kind: "failure", why: "expected failure without a reason" }
      : { kind: "passed" };
  }
  if (outcome.status === "flaky") {
    return { kind: "failure", why: "flaky" };
  }
  if (outcome.status !== "skipped") {
    return { kind: "failure", why: "failed" };
  }
  if (outcome.expectedStatus !== "skipped") {
    return { kind: "failure", why: "missing from the report" };
  }
  return isExplained(outcome.annotations, SKIP_ANNOTATIONS)
    ? { kind: "explained" }
    : { kind: "failure", why: "skipped without a reason" };
}

/**
 * Decides from Playwright's own records whether a run is done: every listed test (`--list --reporter=json`) is in the
 * report (JSON reporter) of the same project, none failed or was flaky, and every skip has a reason. A skip is
 * explained by a `known issue` annotation or a `skip` or `fixme` annotation with a description, an expected failure by
 * a `known issue` or a `fail` annotation with a description; a test the runner never started (skipped though it
 * expected to run) counts as missing. A test listed more than once (`--repeat-each`) is reconciled entry by entry and
 * a missing entry fails; a failing report entry beyond the listed count still fails, a passing one is ignored. Tests in
 * the report that were not listed are ignored.
 *
 * @throws Error when an input is not Playwright JSON, has `errors`, or the list holds no tests.
 */
export function reconcileRun(listed: unknown, report: unknown): RunVerdict {
  const tests = listedTests(listed);
  const outcomes = reportedOutcomes(report);
  if (tests.length === 0) {
    throw new Error("reconcile: the list contains no tests");
  }
  const verdict: RunVerdict = { expected: tests.length, passed: 0, explainedSkips: 0, failures: [] };
  const listedCount = new Map<string, Listed & { count: number }>();
  for (const { test, project } of tests) {
    const id = key(test, project);
    listedCount.set(id, { test, project, count: (listedCount.get(id)?.count ?? 0) + 1 });
  }
  for (const [id, { test, project, count }] of listedCount) {
    const reported = outcomes.get(id) ?? [];
    const judged: Judgement[] = reported.map(judge);
    for (let missing = reported.length; missing < count; missing += 1) {
      judged.push({ kind: "failure", why: "missing from the report" });
    }
    for (const judgement of judged) {
      if (judgement.kind === "failure") {
        verdict.failures.push({ test, project, why: judgement.why });
      }
    }
    const room = Math.max(0, count - judged.filter(({ kind }) => kind === "failure").length);
    for (const { kind } of judged.filter(({ kind }) => kind !== "failure").slice(0, room)) {
      if (kind === "passed") {
        verdict.passed += 1;
      } else {
        verdict.explainedSkips += 1;
      }
    }
  }
  return verdict;
}

function readJson(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`reconcile: ${file} cannot be read`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`reconcile: ${file} is not valid JSON`);
  }
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const [listFile, reportFile] = process.argv.slice(2);
    if (listFile === undefined || reportFile === undefined) {
      throw new Error("reconcile: usage is node qa/reconcile-run.mts <list.json> <report.json>");
    }
    const verdict = reconcileRun(readJson(listFile), readJson(reportFile));
    process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
    if (verdict.failures.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
