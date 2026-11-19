import type { ProjectFacts } from "./project-facts.mts";
import type { QualityFinding } from "./test-shape.mts";

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { readProjectFacts } from "./project-facts.mts";

const CLI_FILE_NAME = "test-duration.mts";
const TITLE_SEPARATOR = " › ";
const PASSED = "passed";
const EVEN = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function notPlaywrightJson(label: string): never {
  throw new Error(`test-duration: the ${label} is not Playwright JSON`);
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

function finalPassedDuration(entry: Record<string, unknown>, label: string): number | undefined {
  const last = listOf(entry["results"], label).at(-1);
  if (last === undefined) {
    return undefined;
  }
  if (!isRecord(last) || typeof last["duration"] !== "number") {
    return notPlaywrightJson(label);
  }
  return last["status"] === PASSED ? last["duration"] : undefined;
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
    for (const entry of listOf(spec["tests"], label)) {
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

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / EVEN);
  const high = sorted[middle] ?? 0;
  return sorted.length % EVEN === 1 ? high : Math.round(((sorted[middle - 1] ?? high) + high) / EVEN);
}

function medianDurations(
  report: unknown,
  project: string,
  label: string,
  mustHoldProject: boolean,
): Map<string, number> {
  if (!isRecord(report) || !Array.isArray(report["suites"])) {
    return notPlaywrightJson(label);
  }
  const durations = new Map<string, number[]>();
  let ofProject = 0;
  for (const fileSuite of report["suites"]) {
    if (!isRecord(fileSuite)) {
      notPlaywrightJson(label);
    }
    const file = textOf(fileSuite["file"] ?? fileSuite["title"], label);
    walk(fileSuite, [], file, label, (test, entry) => {
      if (entry["projectName"] !== project) {
        return;
      }
      ofProject += 1;
      const duration = finalPassedDuration(entry, label);
      if (duration !== undefined) {
        durations.set(test, [...(durations.get(test) ?? []), duration]);
      }
    });
  }
  if (mustHoldProject && ofProject === 0) {
    throw new Error(`test-duration: the report holds no test of project ${project}`);
  }
  return new Map([...durations].map(([test, values]) => [test, median(values)]));
}

/**
 * Judges the duration of every test that passed in a Playwright JSON report (the reporter output `reconcile-run`
 * reads) for one project. A test run several times (`--repeat-each`) is judged by the MEDIAN of its passing runs, each
 * run counted by its last attempt: one slow call on a shared stand must not fail a test that is usually fast, while
 * a test that is slow in most runs still does. A test is reported when its median is above the project's
 * `durationBudgetMs` (a project without a budget is not judged on it), and, when a previous report is given, when it
 * is more than `slowdownRatio` times its median in that report. A test that failed, was skipped or is absent from the
 * previous report is not judged: that is `reconcile-run`'s business and a first run has nothing to compare with.
 *
 * @throws Error when an input is not Playwright JSON or the report holds no test of the project.
 */
export function checkDurations(
  report: unknown,
  project: string,
  quality: ProjectFacts["quality"],
  previous?: unknown,
): QualityFinding[] {
  const current = medianDurations(report, project, "report", true);
  const before =
    previous === undefined ? new Map<string, number>() : medianDurations(previous, project, "previous", false);
  const budget = quality.durationBudgetMs[project];
  const findings: QualityFinding[] = [];
  for (const [test, duration] of current) {
    if (budget !== undefined && duration > budget) {
      findings.push({ test, finding: `median ${duration} ms is above the ${budget} ms budget of project ${project}` });
    }
    const earlier = before.get(test);
    if (earlier !== undefined && earlier > 0 && duration > earlier * quality.slowdownRatio) {
      const times = (duration / earlier).toFixed(1);
      findings.push({
        test,
        finding: `median ${duration} ms is ${times} times the previous ${earlier} ms, above the ${quality.slowdownRatio} times that quality.slowdownRatio allows`,
      });
    }
  }
  return findings;
}

function readJson(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`test-duration: ${file} cannot be read`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`test-duration: ${file} is not valid JSON`);
  }
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const [reportFile, project, previousFile, ...extra] = process.argv.slice(2);
    if (reportFile === undefined || project === undefined || extra.length > 0) {
      throw new Error("test-duration: usage is node qa/test-duration.mts <report.json> <project> [<previous.json>]");
    }
    const findings = checkDurations(
      readJson(reportFile),
      project,
      readProjectFacts().quality,
      previousFile === undefined ? undefined : readJson(previousFile),
    );
    process.stdout.write(
      findings.length === 0 ? "ok\n" : `${findings.map((f) => `${f.test}: ${f.finding}`).join("\n")}\n`,
    );
    if (findings.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
