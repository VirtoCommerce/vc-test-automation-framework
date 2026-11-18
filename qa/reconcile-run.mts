import { readFileSync } from "node:fs";
import { basename } from "node:path";

export type RunFailure = {
  test: string;
  project: string;
  why: "failed" | "flaky" | "missing from the report" | "skipped without a reason";
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
const EXPLAINED_ANNOTATIONS = ["skip", "fixme"];
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

function walkRoot(root: unknown, label: string, visit: (test: string, entry: Record<string, unknown>) => void): void {
  if (!isRecord(root) || !Array.isArray(root["suites"])) {
    throw new Error(`reconcile: the ${label} has no suites`);
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

function reportedOutcomes(report: unknown): Map<string, Outcome> {
  const outcomes = new Map<string, Outcome>();
  walkRoot(report, "report", (test, entry) => {
    outcomes.set(key(test, textOf(entry["projectName"], "report")), {
      status: textOf(entry["status"], "report"),
      expectedStatus: textOf(entry["expectedStatus"], "report"),
      annotations: annotationsOf(entry["annotations"], "report"),
    });
  });
  return outcomes;
}

function isExplained(annotations: readonly Annotation[]): boolean {
  return annotations.some(
    ({ type, description }) =>
      type === KNOWN_ISSUE_ANNOTATION || (EXPLAINED_ANNOTATIONS.includes(type) && description.trim() !== ""),
  );
}

/**
 * Decides from Playwright's own records whether a run is done: every listed test (`--list --reporter=json`) is in the
 * report (JSON reporter) of the same project, none failed or was flaky, and every skip has a reason. A skip is
 * explained by a `known issue` annotation or a `skip` or `fixme` annotation with a description; a test the runner
 * never started (skipped though it expected to run) counts as missing. Tests in the report that were not listed are
 * ignored.
 *
 * @throws Error when an input is not Playwright JSON.
 */
export function reconcileRun(listed: unknown, report: unknown): RunVerdict {
  const tests = listedTests(listed);
  const outcomes = reportedOutcomes(report);
  const verdict: RunVerdict = { expected: tests.length, passed: 0, explainedSkips: 0, failures: [] };
  for (const { test, project } of tests) {
    const outcome = outcomes.get(key(test, project));
    const fail = (why: RunFailure["why"]) => verdict.failures.push({ test, project, why });
    if (outcome === undefined) {
      fail("missing from the report");
    } else if (outcome.status === "expected") {
      verdict.passed += 1;
    } else if (outcome.status === "flaky") {
      fail("flaky");
    } else if (outcome.status !== "skipped") {
      fail("failed");
    } else if (outcome.expectedStatus !== "skipped") {
      fail("missing from the report");
    } else if (isExplained(outcome.annotations)) {
      verdict.explainedSkips += 1;
    } else {
      fail("skipped without a reason");
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
