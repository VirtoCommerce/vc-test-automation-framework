import type { RunVerdict } from "../../../qa/reconcile-run.mts";

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { reconcileRun } from "../../../qa/reconcile-run.mts";

const LIST_FILE = "tests/unit/qa/fixtures/list.json";
const REPORT_FILE = "tests/unit/qa/fixtures/report.json";
const LISTED: unknown = JSON.parse(readFileSync(LIST_FILE, "utf8"));
const REPORT: unknown = JSON.parse(readFileSync(REPORT_FILE, "utf8"));

type Node = {
  title?: string;
  specs?: { title: string; tests: { projectName: string }[] }[];
  suites?: Node[];
  [key: string]: unknown;
};

function keep(node: Node, titles: readonly string[], dropFrom: (title: string) => string | undefined): Node {
  return {
    ...node,
    specs: (node.specs ?? [])
      .filter((spec) => titles.includes(spec.title))
      .map((spec) => ({
        ...spec,
        tests: spec.tests.filter((entry) => dropFrom(spec.title) !== entry.projectName),
      })),
    suites: (node.suites ?? []).map((child) => keep(child, titles, dropFrom)),
  };
}

function only(
  source: unknown,
  titles: readonly string[],
  dropFrom: (title: string) => string | undefined = () => undefined,
): unknown {
  const root = source as { suites: Node[] };
  return { ...root, suites: root.suites.map((suite) => keep(suite, titles, dropFrom)) };
}

type Entry = Record<string, unknown> & { projectName: string };

function reshape(source: unknown, title: string, change: (entries: Entry[]) => Entry[]): unknown {
  function visit(node: Node): Node {
    return {
      ...node,
      specs: (node.specs ?? []).map((spec) =>
        spec.title === title ? { ...spec, tests: change(spec.tests as Entry[]) } : spec,
      ),
      suites: (node.suites ?? []).map(visit),
    };
  }
  const root = source as { suites: Node[] };
  return { ...root, suites: root.suites.map(visit) };
}

function repeated(statuses: readonly string[]): (entries: Entry[]) => Entry[] {
  return (entries) => {
    const [base] = entries;
    return base?.projectName === "alpha" ? statuses.map((status) => ({ ...base, status })) : entries;
  };
}

function run(titles: readonly string[], dropFromReport?: (title: string) => string | undefined) {
  return reconcileRun(only(LISTED, titles), only(REPORT, titles, dropFromReport));
}

test.describe("run reconciliation", () => {
  test("all passed", () => {
    expect(run(["passes", "declared skip"])).toEqual({ expected: 4, passed: 4, explainedSkips: 0, failures: [] });
  });

  test("a known-issue expected failure counts as passed", () => {
    expect(run(["expected failure"])).toEqual({ expected: 2, passed: 2, explainedSkips: 0, failures: [] });
  });

  test("a module skip with its reason is explained", () => {
    expect(run(["module skip"])).toEqual({ expected: 2, passed: 0, explainedSkips: 2, failures: [] });
  });

  test("a skip marked as a known issue without a ticket is explained", () => {
    expect(run(["known issue fixme"])).toEqual({ expected: 2, passed: 0, explainedSkips: 2, failures: [] });
  });

  test("a bare skip fails", () => {
    const verdict = run(["bare skip"]);

    expect(verdict.explainedSkips).toBe(0);
    expect(verdict.failures).toEqual([
      { test: "sample.test.ts › group › bare skip", project: "alpha", why: "skipped without a reason" },
      { test: "sample.test.ts › group › bare skip", project: "beta", why: "skipped without a reason" },
    ]);
  });

  test("a flaky test fails", () => {
    const verdict = run(["flaky"]);

    expect(verdict.passed).toBe(0);
    expect(verdict.failures.map(({ project, why }) => [project, why])).toEqual([
      ["alpha", "flaky"],
      ["beta", "flaky"],
    ]);
  });

  test("a failed test fails", () => {
    expect(run(["fails"]).failures.map(({ project, why }) => [project, why])).toEqual([
      ["alpha", "failed"],
      ["beta", "failed"],
    ]);
  });

  test("a listed test missing from the report fails the run", () => {
    const verdict = run(["passes", "module skip"], (title) => (title === "passes" ? "beta" : undefined));

    expect(verdict).toEqual({
      expected: 4,
      passed: 1,
      explainedSkips: 2,
      failures: [{ test: "sample.test.ts › group › passes", project: "beta", why: "missing from the report" }],
    });
  });

  test("a project missing from the whole report fails every test of it", () => {
    const verdict = run(["passes", "fails"], () => "alpha");

    expect(verdict.failures.map(({ test, project, why }) => [test, project, why])).toEqual([
      ["sample.test.ts › group › passes", "alpha", "missing from the report"],
      ["sample.test.ts › group › fails", "alpha", "missing from the report"],
      ["sample.test.ts › group › fails", "beta", "failed"],
    ]);
  });

  test("a test the run never started is missing, not skipped", () => {
    expect(run(["never runs"]).failures.map(({ why }) => why)).toEqual([
      "missing from the report",
      "missing from the report",
    ]);
  });

  test("tests in the report that were not listed are ignored", () => {
    const verdict = reconcileRun(only(LISTED, ["passes"]), REPORT);

    expect(verdict).toEqual({ expected: 2, passed: 2, explainedSkips: 0, failures: [] });
  });

  test("every listed test is accounted for in the whole fixture", () => {
    const verdict = reconcileRun(LISTED, REPORT);

    expect(verdict.expected).toBe(22);
    expect(verdict.passed + verdict.explainedSkips + verdict.failures.length).toBe(verdict.expected);
    expect(verdict.passed).toBe(6);
    expect(verdict.explainedSkips).toBe(4);
  });

  test.describe("a run that cannot be trusted", () => {
    const NO_TESTS = { suites: [], errors: [] };

    test("an empty list fails", () => {
      expect(() => reconcileRun(NO_TESTS, NO_TESTS)).toThrow("reconcile: the list contains no tests");
      expect(() => reconcileRun(only(LISTED, ["no such test"]), REPORT)).toThrow(
        "reconcile: the list contains no tests",
      );
    });

    test("errors in the list fail, even with no suites", () => {
      const broken = { suites: [], errors: [{ message: "import failed" }] };

      expect(() => reconcileRun(broken, NO_TESTS)).toThrow("reconcile: the list has errors: import failed");
      expect(() => reconcileRun({ ...(LISTED as object), errors: [{ message: "import failed" }] }, REPORT)).toThrow(
        "reconcile: the list has errors: import failed",
      );
    });

    test("a global error in the report fails next to passing tests", () => {
      const titles = ["passes"];
      const report = { ...(only(REPORT, titles) as object), errors: [{ message: "global setup failed" }] };

      expect(() => reconcileRun(only(LISTED, titles), report)).toThrow(
        "reconcile: the report has errors: global setup failed",
      );
    });

    test("an errors field that is not a list is rejected", () => {
      expect(() => reconcileRun(LISTED, { ...(REPORT as object), errors: "boom" })).toThrow(
        "reconcile: the report is not Playwright JSON",
      );
    });

    test("a test repeated in the run keeps its worst outcome", () => {
      const listed = reshape(only(LISTED, ["passes"]), "passes", repeated(["skipped", "skipped"]));
      for (const statuses of [
        ["unexpected", "expected"],
        ["expected", "unexpected"],
      ]) {
        const report = reshape(only(REPORT, ["passes"]), "passes", repeated(statuses));

        const verdict = reconcileRun(listed, report);

        expect(verdict.passed).toBe(2);
        expect(verdict.failures.map(({ project, why }) => [project, why])).toEqual([["alpha", "failed"]]);
      }
    });

    test("a repeated test with fewer entries in the report than in the list fails", () => {
      const listed = reshape(only(LISTED, ["passes"]), "passes", repeated(["skipped", "skipped"]));
      const report = reshape(only(REPORT, ["passes"]), "passes", repeated(["expected"]));

      const verdict = reconcileRun(listed, report);

      expect(verdict.passed).toBe(2);
      expect(verdict.failures.map(({ project, why }) => [project, why])).toEqual([
        ["alpha", "missing from the report"],
      ]);
    });

    test("a failing repetition the list did not expect is not hidden", () => {
      const listed = reshape(only(LISTED, ["passes"]), "passes", repeated(["skipped"]));
      const report = reshape(only(REPORT, ["passes"]), "passes", repeated(["expected", "unexpected"]));

      expect(reconcileRun(listed, report).failures.map(({ why }) => why)).toEqual(["failed"]);
    });

    test("an expected failure needs a known issue or a fail annotation with a reason", () => {
      function withAnnotations(annotations: unknown[]): RunVerdict {
        const report = reshape(only(REPORT, ["expected failure"]), "expected failure", (entries) =>
          entries.map((entry) => ({ ...entry, annotations })),
        );
        return reconcileRun(only(LISTED, ["expected failure"]), report);
      }
      const unexplained = [
        {
          test: "sample.test.ts › group › expected failure",
          project: "alpha",
          why: "expected failure without a reason",
        },
        {
          test: "sample.test.ts › group › expected failure",
          project: "beta",
          why: "expected failure without a reason",
        },
      ];

      expect(withAnnotations([]).failures).toEqual(unexplained);
      expect(withAnnotations([{ type: "fail" }]).failures).toEqual(unexplained);
      expect(withAnnotations([{ type: "fail", description: " " }]).failures).toEqual(unexplained);
      expect(withAnnotations([{ type: "fail", description: "TKT-1: bug" }]).failures).toEqual([]);
      expect(withAnnotations([{ type: "known issue", description: "TKT-1: bug" }]).failures).toEqual([]);
    });

    test("the command line exits 1 for an empty list and for load errors", () => {
      const folder = mkdtempSync(join(tmpdir(), "reconcile-"));
      try {
        const emptyFile = join(folder, "empty.json");
        const brokenFile = join(folder, "broken.json");
        writeFileSync(emptyFile, JSON.stringify({ suites: [], errors: [] }));
        writeFileSync(brokenFile, JSON.stringify({ suites: [], errors: [{ message: "import failed" }] }));
        const spawn = (listFile: string) =>
          spawnSync(process.execPath, ["qa/reconcile-run.mts", listFile, REPORT_FILE], { encoding: "utf8" });

        expect(spawn(emptyFile).status).toBe(1);
        expect(spawn(emptyFile).stderr).toContain("reconcile: the list contains no tests");
        expect(spawn(brokenFile).status).toBe(1);
        expect(spawn(brokenFile).stderr).toContain("reconcile: the list has errors: import failed");
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    });
  });

  test("input that is not Playwright JSON is rejected", () => {
    expect(() => reconcileRun({}, REPORT)).toThrow("reconcile: the list has no suites");
    expect(() => reconcileRun(LISTED, [])).toThrow("reconcile: the report has no suites");
    expect(() => reconcileRun(LISTED, { suites: [{ title: "x", specs: [{ title: "y" }] }] })).toThrow(
      "reconcile: the report is not Playwright JSON",
    );
  });

  test.describe("command line", () => {
    function cli(listFile: string, reportFile: string) {
      return spawnSync(process.execPath, ["qa/reconcile-run.mts", listFile, reportFile], { encoding: "utf8" });
    }

    test("exits 1 and prints the verdict when a test failed", () => {
      const result = cli(LIST_FILE, REPORT_FILE);

      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ expected: 22, passed: 6 });
    });

    test("exits 0 when every test ran and every skip is explained", () => {
      const folder = mkdtempSync(join(tmpdir(), "reconcile-"));
      try {
        const titles = ["passes", "module skip"];
        const listFile = join(folder, "list.json");
        const reportFile = join(folder, "report.json");
        writeFileSync(listFile, JSON.stringify(only(LISTED, titles)));
        writeFileSync(reportFile, JSON.stringify(only(REPORT, titles)));

        const result = cli(listFile, reportFile);

        expect(result.status).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({ expected: 4, failures: [] });
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    });

    test("exits 1 naming a file that cannot be read", () => {
      const result = cli("nowhere.json", REPORT_FILE);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("reconcile: nowhere.json cannot be read");
    });

    test("exits 1 with the usage when a file is not given", () => {
      const result = spawnSync(process.execPath, ["qa/reconcile-run.mts", LIST_FILE], { encoding: "utf8" });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("usage is node qa/reconcile-run.mts <list.json> <report.json>");
    });
  });
});
