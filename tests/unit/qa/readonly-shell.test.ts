import { spawnSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import { hookBlockReason, isReadOnlyAgent, isReadOnlyCommand } from "../../../qa/readonly-shell.mts";

const HOOK_FILE = ".claude/hooks/readonly-shell.mts";

const ALLOWED = [
  "git diff",
  "git diff dev...HEAD",
  "git diff --stat dev...HEAD -- tests/restapi/cart.spec.ts",
  "git log --oneline -n 5",
  "git show HEAD~1",
  "git status --short",
  "npx playwright test --list",
  "npx playwright test --list --reporter=json --project=restapi tests/restapi/cart.spec.ts",
  "node qa/project-facts.mts",
  "node qa/contract.mts check .qa/contracts/cart-coupons.md",
  "node qa/ticket-card.mts check card.json",
  "node qa/reconcile-run.mts .qa/runs/x/list.restapi.json .qa/runs/x/report.restapi.json",
  "node qa/judge-verdict.mts check .qa/judge/x.json",
  "node qa/rank-gaps.mts gaps.json",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/cart/list.restapi.json npx playwright test --list --reporter=json --project=restapi",
];

const CHAINED = [
  "git diff; rm -rf x",
  "git diff && rm -rf x",
  "git diff || rm -rf x",
  "git diff | sh",
  "git diff & rm x",
  "git diff $(rm -rf x)",
  "git diff `rm -rf x`",
  "git diff > out.txt",
  "git diff < in.txt",
  "git diff\nrm -rf x",
  "git diff\trm",
  "git diff $HOME",
  "git diff 'a b'",
  'git diff "a b"',
  "git diff \\x",
  "git diff *",
  "git diff {a,b}",
];

const NOT_LISTED = [
  "",
  "   ",
  "rm -rf x",
  "git push",
  "git push origin dev",
  "git commit -m x",
  "git checkout dev",
  "git reset --hard",
  "git -c core.pager=sh diff",
  "git diff --output=out.txt",
  "git log --output out.txt",
  "git diff --ext-diff",
  "git diff --textconv",
  "git",
  "git diff-tree HEAD",
  "npx playwright test",
  "npx playwright test tests/restapi/cart.spec.ts",
  "npx playwright test --list --reporter=./evil.js",
  "npx playwright test --list --config=evil.config.ts",
  "npx playwright show-report",
  "npx playwright install",
  "npx rimraf x",
  "node qa/prove-fails.mts x",
  "node qa/other.mts x",
  "node qa/../evil.mts",
  "node evil.mts",
  "node --eval 1",
  "node -e 1 qa/contract.mts",
  "node qa/contract.mts.sh",
  "cat .env",
  "ls",
  "curl https://example.com",
  "FOO=bar git diff",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=out.json npx playwright test --list --reporter=json",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/../../x.json npx playwright test --list --reporter=json",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/a/list.json git diff",
];

test.describe("read-only shell (unit)", () => {
  test("allows git diff with a path", () => {
    expect(isReadOnlyCommand("git diff --stat dev...HEAD -- tests/restapi/cart.spec.ts")).toBe(true);
  });

  test("allows the list command", () => {
    expect(isReadOnlyCommand("npx playwright test --list --reporter=json --project=restapi tests/a.spec.ts")).toBe(
      true,
    );
  });

  for (const command of ALLOWED) {
    test(`allows ${JSON.stringify(command)}`, () => {
      expect(isReadOnlyCommand(command)).toBe(true);
    });
  }

  for (const command of CHAINED) {
    test(`rejects chained, substituted and redirected commands: ${JSON.stringify(command)}`, () => {
      expect(isReadOnlyCommand(command)).toBe(false);
    });
  }

  for (const command of NOT_LISTED) {
    test(`rejects anything not on the list: ${JSON.stringify(command)}`, () => {
      expect(isReadOnlyCommand(command)).toBe(false);
    });
  }

  test("names the four read-only agents", () => {
    for (const name of ["qa-reviewer", "qa-explorer", "qa-coverage", "qa-judge"]) {
      expect(isReadOnlyAgent(name)).toBe(true);
    }
    for (const name of ["qa-automation-expert", "qa-healer", "qa-planner", "", undefined]) {
      expect(isReadOnlyAgent(name)).toBe(false);
    }
  });

  test("blocks a read-only agent's unlisted command with one line and passes everything else", () => {
    const reason = hookBlockReason({ agent_type: "qa-reviewer", tool_input: { command: "git push" } });
    expect(reason).toMatch(/^[^\n]+$/);
    expect(reason).toContain("qa-reviewer");
    expect(hookBlockReason({ agent_type: "qa-reviewer", tool_input: { command: "git diff" } })).toBeUndefined();
    expect(
      hookBlockReason({ agent_type: "qa-automation-expert", tool_input: { command: "git push" } }),
    ).toBeUndefined();
    expect(hookBlockReason({ tool_input: { command: "rm -rf x" } })).toBeUndefined();
  });

  test("blocks a read-only agent whose command is missing or not text", () => {
    expect(hookBlockReason({ agent_type: "qa-judge", tool_input: {} })).toBeDefined();
    expect(hookBlockReason({ agent_type: "qa-judge", tool_input: { command: 1 } })).toBeDefined();
    expect(hookBlockReason({ agent_type: "qa-judge" })).toBeDefined();
  });

  test("passes input that is not an object", () => {
    expect(hookBlockReason(null)).toBeUndefined();
    expect(hookBlockReason("text")).toBeUndefined();
    expect(hookBlockReason([])).toBeUndefined();
  });
});

function runHook(stdin: string): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync("node", [HOOK_FILE], { input: stdin, encoding: "utf8" });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

test.describe("read-only shell hook script (unit)", () => {
  test("blocks a read-only agent running git push with exit code 2 and one line on stderr", () => {
    const result = runHook(
      JSON.stringify({ hook_event_name: "PreToolUse", agent_type: "qa-reviewer", tool_input: { command: "git push" } }),
    );
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toMatch(/^[^\n]+$/);
    expect(result.stderr).toContain("qa-reviewer");
  });

  test("allows a read-only agent running git diff", () => {
    const result = runHook(JSON.stringify({ agent_type: "qa-reviewer", tool_input: { command: "git diff" } }));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("allows a call with no agent type, whatever the command", () => {
    const result = runHook(JSON.stringify({ tool_input: { command: "git push --force" } }));
    expect(result.status).toBe(0);
  });

  test("allows another agent's call", () => {
    const result = runHook(
      JSON.stringify({ agent_type: "qa-automation-expert", tool_input: { command: "npm run typecheck" } }),
    );
    expect(result.status).toBe(0);
  });

  test("blocks a read-only agent when stdin carries no command", () => {
    const result = runHook(JSON.stringify({ agent_type: "qa-explorer", tool_input: {} }));
    expect(result.status).toBe(2);
  });

  test("passes input it cannot parse", () => {
    expect(runHook("not json").status).toBe(0);
    expect(runHook("").status).toBe(0);
  });
});
