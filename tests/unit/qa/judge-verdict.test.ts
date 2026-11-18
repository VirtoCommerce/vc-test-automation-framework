import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { checkJudgeVerdict, criteriaOf, JUDGE_ROLES } from "../../../qa/judge-verdict.mts";

const CLI = "qa/judge-verdict.mts";
const CRITERIA_DIR = ".claude/skills/judge-criteria";
const AGENT_FILE = ".claude/agents/qa-judge.md";
const MAX_AGENT_CHARACTERS = 8000;

function verdictOf(role: string, names: readonly string[], overrides: Record<string, unknown> = {}): unknown {
  return {
    role,
    subject: "tests/restapi/cart.spec.ts",
    criteria: names.map((name) => ({ name, pass: true, evidence: `checked ${name} in tests/restapi/cart.spec.ts:12` })),
    verdict: "pass",
    ...overrides,
  };
}

function expertVerdict(overrides: Record<string, unknown> = {}): unknown {
  return verdictOf("expert", criteriaOf("expert"), overrides);
}

function runCli(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", [CLI, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test.describe("judge verdict check (unit)", () => {
  test("every role has criteria in its file, and a verdict covering them passes", () => {
    expect(JUDGE_ROLES).toEqual(["planner", "expert", "explorer", "healer", "coverage"]);
    for (const role of JUDGE_ROLES) {
      const names = criteriaOf(role);
      expect(names.length).toBeGreaterThanOrEqual(2);
      expect(new Set(names).size).toBe(names.length);
      expect(checkJudgeVerdict(verdictOf(role, names), role)).toEqual([]);
    }
  });

  test("the expert criteria include the proof that a test fails when the behaviour breaks", () => {
    expect(criteriaOf("expert")).toContain("fails-when-behaviour-breaks");
  });

  test("a verdict missing a criterion fails the check", () => {
    const names = criteriaOf("expert");
    const [dropped, ...rest] = names;
    const problems = checkJudgeVerdict(verdictOf("expert", rest), "expert");
    expect(problems).toEqual([`judge verdict: criterion "${dropped}" is missing`]);
  });

  test("pass with a failed criterion fails the check", () => {
    const names = criteriaOf("expert");
    const [first, ...rest] = names;
    const json = verdictOf("expert", names, {
      criteria: [
        { name: first, pass: false, evidence: "the test has no assertion" },
        ...rest.map((name) => ({ name, pass: true, evidence: "ok" })),
      ],
    });
    expect(checkJudgeVerdict(json, "expert")).toEqual([
      `judge verdict: verdict is "pass" but criterion "${first}" failed`,
    ]);
    expect(checkJudgeVerdict({ ...(json as object), verdict: "fail" }, "expert")).toEqual([]);
  });

  test("fail with every criterion passing fails the check", () => {
    expect(checkJudgeVerdict(expertVerdict({ verdict: "fail" }), "expert")).toEqual([
      'judge verdict: verdict is "fail" but every criterion passed',
    ]);
  });

  test("empty evidence fails the check", () => {
    const names = criteriaOf("expert");
    const [first, ...rest] = names;
    for (const evidence of ["", "   ", 4, undefined]) {
      const json = verdictOf("expert", names, {
        criteria: [
          { name: first, pass: true, evidence },
          ...rest.map((name) => ({ name, pass: true, evidence: "ok" })),
        ],
      });
      expect(checkJudgeVerdict(json, "expert")).toEqual([`judge verdict: criterion "${first}" has no evidence`]);
    }
  });

  test("a criterion that is not in the role's file, or twice, fails the check", () => {
    const names = criteriaOf("expert");
    expect(checkJudgeVerdict(verdictOf("expert", [...names, "looks-nice"]), "expert")).toEqual([
      'judge verdict: criterion "looks-nice" is not a criterion of the expert',
    ]);
    const [first = ""] = names;
    expect(checkJudgeVerdict(verdictOf("expert", [...names, first]), "expert")).toEqual([
      `judge verdict: criterion "${first}" appears twice`,
    ]);
  });

  test("a verdict of another role, no subject, a bad verdict or a bad shape fails the check", () => {
    expect(checkJudgeVerdict(expertVerdict({ role: "healer" }), "expert")).toEqual([
      'judge verdict: role is "healer", expected "expert"',
    ]);
    expect(checkJudgeVerdict(expertVerdict({ subject: " " }), "expert")).toEqual([
      "judge verdict: subject is not a non-empty string",
    ]);
    expect(checkJudgeVerdict(expertVerdict({ verdict: "maybe" }), "expert")).toEqual([
      'judge verdict: verdict is not "pass" or "fail"',
    ]);
    expect(checkJudgeVerdict(expertVerdict({ criteria: "all" }), "expert")).toEqual([
      "judge verdict: criteria is not a list",
    ]);
    expect(checkJudgeVerdict(expertVerdict({ criteria: [1] }), "expert")).toContain(
      "judge verdict: criteria[0] is not an object",
    );
    expect(checkJudgeVerdict(null, "expert")).toEqual(["judge verdict: not a JSON object"]);
    expect(checkJudgeVerdict([], "expert")).toEqual(["judge verdict: not a JSON object"]);
  });

  test("a criterion with a pass that is not true or false fails the check", () => {
    const names = criteriaOf("expert");
    const [first, ...rest] = names;
    const json = verdictOf("expert", names, {
      criteria: [
        { name: first, pass: "yes", evidence: "ok" },
        ...rest.map((name) => ({ name, pass: true, evidence: "ok" })),
      ],
    });
    expect(checkJudgeVerdict(json, "expert")).toEqual([
      `judge verdict: criterion "${first}" has no true or false pass`,
    ]);
  });

  test("reads the role's criteria from the directory it is given", () => {
    const dir = mkdtempSync(join(tmpdir(), "judge-criteria-"));
    try {
      writeFileSync(join(dir, "expert.md"), "# Expert\n\n- `alpha-one`: first\n- `beta-two`: second\ntext\n");
      expect(criteriaOf("expert", dir)).toEqual(["alpha-one", "beta-two"]);
      expect(checkJudgeVerdict(verdictOf("expert", ["alpha-one", "beta-two"]), "expert", dir)).toEqual([]);
      expect(() => criteriaOf("healer", dir)).toThrow("judge verdict: the criteria file");
      writeFileSync(join(dir, "healer.md"), "# Healer\n\nno list\n");
      expect(() => criteriaOf("healer", dir)).toThrow("lists no criteria");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("keeps the criteria in one place: the directory the agent is pointed at", () => {
    expect(criteriaOf("planner", CRITERIA_DIR)).toEqual(criteriaOf("planner"));
  });
});

test.describe("judge verdict CLI (unit)", () => {
  test("prints ok for a good file, taking the role from the file or the argument", () => {
    const dir = mkdtempSync(join(tmpdir(), "judge-cli-"));
    try {
      const file = join(dir, "judge-expert.json");
      writeFileSync(file, JSON.stringify(expertVerdict()));
      expect(runCli("check", file)).toMatchObject({ status: 0, stdout: "ok\n" });
      expect(runCli("check", file, "expert")).toMatchObject({ status: 0, stdout: "ok\n" });
      const wrong = runCli("check", file, "healer");
      expect(wrong.status).toBe(1);
      expect(wrong.stderr).toContain('role is "expert", expected "healer"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("prints each problem and exits 1 for a bad file, and says so for an unreadable one", () => {
    const dir = mkdtempSync(join(tmpdir(), "judge-cli-"));
    try {
      mkdirSync(join(dir, "sub"));
      const bad = join(dir, "bad.json");
      writeFileSync(bad, JSON.stringify(expertVerdict({ criteria: [] })));
      const result = runCli("check", bad);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("is missing");
      const notJson = join(dir, "not.json");
      writeFileSync(notJson, "{");
      expect(runCli("check", notJson)).toMatchObject({ status: 1 });
      expect(runCli("check", join(dir, "absent.json")).stderr).toContain("cannot be read");
      expect(runCli("check").stderr).toContain("usage");
      const unknown = join(dir, "unknown.json");
      writeFileSync(unknown, JSON.stringify({ role: "cook" }));
      expect(runCli("check", unknown).stderr).toContain("role");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe("judge definition (unit)", () => {
  test("the example verdict file passes the check from the command line", () => {
    expect(runCli("check", "tests/unit/qa/fixtures/judge-expert-example.json")).toMatchObject({
      status: 0,
      stdout: "ok\n",
    });
  });

  test("the judge agent is short, runs on sonnet and holds exactly the tools of its role", () => {
    const text = readFileSync(AGENT_FILE, "utf8");
    expect(text.length).toBeLessThanOrEqual(MAX_AGENT_CHARACTERS);
    const header = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
    expect(header).toMatch(/^name: qa-judge$/m);
    expect(header).toMatch(/^model: sonnet$/m);
    expect(header).toMatch(/^tools: Read, Grep, Glob, Bash, Write, Skill$/m);
  });

  test("the judge agent names every criterion of the expert's file", () => {
    const text = readFileSync(AGENT_FILE, "utf8");
    for (const name of criteriaOf("expert")) {
      expect(text).toContain(`\`${name}\``);
    }
  });
});
