import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { hookBlockReason, isReadOnlyAgent, isReadOnlyCommand, READ_ONLY_AGENTS } from "../../../qa/readonly-shell.mts";

const HOOK_FILE = ".claude/hooks/readonly-shell.mts";
const SETTINGS_FILE = ".claude/settings.json";
const PROJECT_DIR = resolve(process.cwd());
const JUDGE_AREA = join(PROJECT_DIR, ".qa", "judge");
const REPORTS_AREA = join(PROJECT_DIR, ".qa", "reports");
const WRITING_TOOLS = ["Edit", "MultiEdit", "NotebookEdit", "PowerShell"];
const JUDGE_COMMAND = "node qa/prove-fails.mts tests/a.spec.ts 12 a title";

const ALLOWED = [
  "git diff",
  "git diff dev...HEAD",
  "git diff --stat dev...HEAD -- tests/restapi/cart.spec.ts",
  "git log --oneline -n 5",
  "git show HEAD~1",
  "git status --short",
  "npx playwright test --list --reporter=json --project=restapi tests/restapi/cart.spec.ts",
  "npx playwright test --list --reporter=list --project=restapi",
  "npx playwright test --list --reporter=null",
  "node qa/project-facts.mts",
  "node qa/contract.mts check .qa/contracts/cart-coupons.md",
  "node qa/ticket-card.mts check card.json",
  "node qa/reconcile-run.mts .qa/runs/x/list.restapi.json .qa/runs/x/report.restapi.json",
  "node qa/rank-gaps.mts gaps.json",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/cart/review-list.restapi.json npx playwright test --list --reporter=json --project=restapi",
];

const JUDGE_ONLY = [
  "node qa/judge-verdict.mts check .qa/judge/x/judge-expert.json",
  "node qa/judge-verdict.mts check .qa/judge/x/judge-expert.json expert",
  "node qa/prove-fails.mts tests/restapi/cart.spec.ts 42 coupon is applied",
  "node qa/prove-fails.mts tests/restapi/cart.spec.ts 42 coupon is applied --project=restapi",
  "node qa/prove-fails.mts tests/restapi/cart.spec.ts 42 coupon --project=restapi is applied",
];

const JUDGE_BAD_SHAPE = [
  "node qa/prove-fails.mts tests/a.spec.ts",
  "node qa/prove-fails.mts tests/a.spec.ts 12",
  "node qa/prove-fails.mts tests/a.spec.ts x title",
  "node qa/prove-fails.mts tests/a.spec.ts title 12",
  "node qa/prove-fails.mts tests/a.spec.ts 12 --evil title",
  "node qa/prove-fails.mts tests/a.spec.ts 12 title --project=a --project=b",
  "node qa/prove-fails.mts tests/a.spec.ts 12 --project=a",
  "node qa/prove-fails.mts --project=unit tests/a.spec.ts 12 title",
  "node qa/prove-fails.mts ../a.spec.ts 12 title",
  "node qa/prove-fails.mts tests/../../a.spec.ts 12 title",
  "node qa/prove-fails.mts /abs/a.spec.ts 12 title",
  "node qa/prove-fails.mts tests/a.spec.ts 12 title .qa/judge/x/break-1.patch --project=",
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

const JUDGE_CHAINED = [
  "node qa/prove-fails.mts tests/a.spec.ts 12 a title; rm x",
  "node qa/prove-fails.mts tests/a.spec.ts 12 a title > out",
  "node qa/prove-fails.mts tests/a.spec.ts 12 'a b'",
  "node qa/prove-fails.mts tests/a.spec.ts 12 $HOME",
  "node qa/prove-fails.mts/../evil.mts",
  "node qa/judge-verdict.mts && rm x",
  "git push",
  "npx playwright test",
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
  "npx playwright test --list",
  "npx playwright test --list --project=unit tests/unit/qa/readonly-shell.test.ts",
  "npx playwright test --list --reporter=line",
  "npx playwright test --list --reporter=dot",
  "npx playwright test --list --reporter=json --reporter=list",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/x/report.restapi.json npx playwright test --list --reporter=json --project=restapi",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/x/list.restapi.json npx playwright test --list --reporter=json --project=restapi",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/x/y/review-list.restapi.json npx playwright test --list --reporter=json",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/review-list.restapi.json npx playwright test --list --reporter=json",
  "npx playwright test tests/restapi/cart.spec.ts",
  "npx playwright test --list --reporter=./evil.js",
  "npx playwright test --list --config=evil.config.ts",
  "npx playwright show-report",
  "npx playwright install",
  "npx rimraf x",
  "node qa/prove-fails.mts x",
  "node qa/judge-verdict.mts check x",
  "node qa/other.mts x",
  "node qa/../evil.mts",
  "node evil.mts",
  "node --eval 1",
  "node -e 1 qa/contract.mts",
  "node qa/contract.mts.sh",
  "node qa/contractxmts check x",
  "cat .env",
  "ls",
  "curl https://example.com",
  "FOO=bar git diff",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=out.json npx playwright test --list --reporter=json",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/../../x.json npx playwright test --list --reporter=json",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/a/list.json git diff",
];

const JUDGE_WRITES = [
  ".qa/judge/cart/judge-expert.json",
  ".qa/judge/cart/break-1.patch",
  `${PROJECT_DIR}/.qa/judge/cart/judge-expert.json`,
  ".qa/judge/./cart/x.json",
];

const NOT_JUDGE_WRITES = [
  ".qa/judge",
  ".qa/judge/",
  ".qa/judgement/x.json",
  ".qa/judge-x/x.json",
  ".qa/runs/x/judge-expert.json",
  ".qa/judge/../runs/x.json",
  ".qa/judge/../../x.json",
  "../.qa/judge/x.json",
  "tests/restapi/cart.spec.ts",
  ".claude/agents/qa-judge.md",
  "qa/judge-verdict.mts",
  "/etc/passwd",
  "C:\\Windows\\x.json",
  "D:/.qa/judge/x.json",
  "\\\\server\\share\\x.json",
  "",
];

const EXPLORER_WRITES = [
  ".qa/reports/explore-cart.md",
  ".qa/reports/explore-cart/notes.md",
  `${PROJECT_DIR}/.qa/reports/explore-cart.md`,
  ".qa/reports/./explore-cart.md",
];

const NOT_EXPLORER_WRITES = [
  ".qa/reports",
  ".qa/reports/",
  ".qa/reportsx/x.md",
  ".qa/reports-x/x.md",
  ".qa/report/x.md",
  ".qa/judge/x/judge-expert.json",
  ".qa/runs/x/explore-cart.md",
  ".qa/reports/../runs/x.md",
  ".qa/reports/../../x.md",
  "../.qa/reports/x.md",
  "tests/restapi/cart.spec.ts",
  "pages/frontend/pages/cart/cart-page.ts",
  ".claude/agents/qa-explorer.md",
  "/etc/passwd",
  "C:\\Windows\\x.md",
  "D:/.qa/reports/x.md",
  "\\\\server\\share\\x.md",
  "",
];

function judgeWrite(file: unknown): Record<string, unknown> {
  return { agent_type: "qa-judge", tool_name: "Write", tool_input: { file_path: file } };
}

function explorerWrite(file: unknown): Record<string, unknown> {
  return { agent_type: "qa-explorer", tool_name: "Write", tool_input: { file_path: file } };
}

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

  for (const command of JUDGE_ONLY) {
    test(`allows only qa-judge to run ${JSON.stringify(command)}`, () => {
      expect(isReadOnlyCommand(command, "qa-judge")).toBe(true);
      expect(isReadOnlyCommand(command, "vc:qa-judge")).toBe(true);
      for (const other of ["qa-reviewer", "qa-explorer", "qa-coverage", "qa-healer", "", undefined]) {
        expect(isReadOnlyCommand(command, other)).toBe(false);
      }
      expect(isReadOnlyCommand(command)).toBe(false);
    });
  }

  for (const command of JUDGE_BAD_SHAPE) {
    test(`refuses a prove-fails call of the wrong shape even for qa-judge: ${JSON.stringify(command)}`, () => {
      expect(isReadOnlyCommand(command, "qa-judge")).toBe(false);
    });
  }

  for (const command of JUDGE_CHAINED) {
    test(`keeps the judge's shell as strict as everyone's: ${JSON.stringify(command)}`, () => {
      expect(isReadOnlyCommand(command, "qa-judge")).toBe(false);
    });
  }

  test("the judge keeps the commands every read-only agent has", () => {
    expect(isReadOnlyCommand("git diff", "qa-judge")).toBe(true);
    expect(isReadOnlyCommand("node qa/project-facts.mts", "qa-judge")).toBe(true);
    expect(isReadOnlyCommand("node qa/judge-verdict.mts check x", "qa-reviewer")).toBe(false);
  });

  test("names the four read-only agents", () => {
    for (const name of ["qa-reviewer", "qa-explorer", "qa-coverage", "qa-judge"]) {
      expect(isReadOnlyAgent(name)).toBe(true);
    }
    for (const name of ["qa-automation-expert", "qa-healer", "qa-planner", "", undefined]) {
      expect(isReadOnlyAgent(name)).toBe(false);
    }
  });

  test("restricts a plugin-prefixed read-only agent", () => {
    expect(isReadOnlyAgent("vc:qa-reviewer")).toBe(true);
    expect(isReadOnlyAgent("a:b:qa-judge")).toBe(true);
    expect(isReadOnlyAgent("vc:qa-healer")).toBe(false);
    expect(isReadOnlyAgent("qa-reviewer:other")).toBe(false);
    expect(hookBlockReason({ agent_type: "vc:qa-reviewer", tool_input: { command: "git push" } })).toBeDefined();
    expect(hookBlockReason({ agent_type: "vc:qa-reviewer", tool_input: { command: "git diff" } })).toBeUndefined();
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

  test("names the listing command with its reporter in the block message", () => {
    const reason = hookBlockReason({ agent_type: "qa-reviewer", tool_input: { command: "git push" } });
    expect(reason).toContain("npx playwright test --list --reporter=json|list|null");
  });

  test("blocks a read-only agent whose command is missing or not text", () => {
    expect(hookBlockReason({ agent_type: "qa-judge", tool_input: {} })).toBeDefined();
    expect(hookBlockReason({ agent_type: "qa-judge", tool_input: { command: 1 } })).toBeDefined();
    expect(hookBlockReason({ agent_type: "qa-judge" })).toBeDefined();
  });

  test("lets the judge run its two commands through the hook decision, and no other read-only agent", () => {
    const bash = (agent: string): unknown => ({
      agent_type: agent,
      tool_name: "Bash",
      tool_input: { command: JUDGE_COMMAND },
    });
    expect(hookBlockReason(bash("qa-judge"), PROJECT_DIR)).toBeUndefined();
    expect(hookBlockReason(bash("vc:qa-judge"), PROJECT_DIR)).toBeUndefined();
    expect(hookBlockReason(bash("qa-reviewer"), PROJECT_DIR)).toBeDefined();
    expect(hookBlockReason(bash("qa-explorer"), PROJECT_DIR)).toBeDefined();
  });

  for (const file of JUDGE_WRITES) {
    test(`lets the judge write ${file}`, () => {
      expect(hookBlockReason(judgeWrite(file), PROJECT_DIR)).toBeUndefined();
      expect(hookBlockReason({ ...judgeWrite(file), agent_type: "vc:qa-judge" }, PROJECT_DIR)).toBeUndefined();
    });
  }

  for (const file of NOT_JUDGE_WRITES) {
    test(`blocks the judge writing ${JSON.stringify(file)}`, () => {
      const reason = hookBlockReason(judgeWrite(file), PROJECT_DIR);
      expect(reason).toMatch(/^[^\n]+$/);
      expect(reason).toContain(".qa/judge/");
    });
  }

  test("blocks a judge write with no usable path", () => {
    expect(hookBlockReason({ agent_type: "qa-judge", tool_name: "Write", tool_input: {} }, PROJECT_DIR)).toBeDefined();
    expect(hookBlockReason(judgeWrite(3), PROJECT_DIR)).toBeDefined();
    expect(hookBlockReason({ agent_type: "qa-judge", tool_name: "Write" }, PROJECT_DIR)).toBeDefined();
  });

  test("blocks every other read-only agent from writing", () => {
    for (const agent of ["qa-reviewer", "qa-coverage"]) {
      for (const file of [".qa/judge/x.json", ".qa/reports/explore-cart.md"]) {
        const input = { ...judgeWrite(file), agent_type: agent };
        expect(hookBlockReason(input, PROJECT_DIR), `${agent} ${file}`).toContain("may not write");
      }
    }
  });

  for (const file of EXPLORER_WRITES) {
    test(`lets the explorer write ${file}`, () => {
      expect(hookBlockReason(explorerWrite(file), PROJECT_DIR)).toBeUndefined();
      expect(hookBlockReason({ ...explorerWrite(file), agent_type: "vc:qa-explorer" }, PROJECT_DIR)).toBeUndefined();
    });
  }

  for (const file of NOT_EXPLORER_WRITES) {
    test(`blocks the explorer writing ${JSON.stringify(file)}`, () => {
      const reason = hookBlockReason(explorerWrite(file), PROJECT_DIR);
      expect(reason).toMatch(/^[^\n]+$/);
      expect(reason).toContain(".qa/reports/");
    });
  }

  test("keeps each writer to its own folder", () => {
    expect(hookBlockReason(judgeWrite(".qa/reports/explore-cart.md"), PROJECT_DIR)).toContain(".qa/judge/");
    expect(hookBlockReason(explorerWrite(".qa/judge/x/judge-expert.json"), PROJECT_DIR)).toContain(".qa/reports/");
  });

  test("blocks an explorer write with no usable path", () => {
    expect(
      hookBlockReason({ agent_type: "qa-explorer", tool_name: "Write", tool_input: {} }, PROJECT_DIR),
    ).toBeDefined();
    expect(hookBlockReason(explorerWrite(3), PROJECT_DIR)).toBeDefined();
    expect(hookBlockReason({ agent_type: "qa-explorer", tool_name: "Write" }, PROJECT_DIR)).toBeDefined();
  });

  test("keeps the explorer's shell as strict as the other read-only agents'", () => {
    const bash = (command: string): unknown => ({
      agent_type: "qa-explorer",
      tool_name: "Bash",
      tool_input: { command },
    });
    expect(hookBlockReason(bash("git diff"), PROJECT_DIR)).toBeUndefined();
    expect(hookBlockReason(bash("node qa/project-facts.mts"), PROJECT_DIR)).toBeUndefined();
    expect(hookBlockReason(bash("npx playwright test --list --reporter=json"), PROJECT_DIR)).toBeUndefined();
    for (const command of [
      "git push",
      "echo x > .qa/reports/x.md",
      "node qa/prove-fails.mts a.spec.ts 1 t",
      "npx playwright test",
    ]) {
      expect(hookBlockReason(bash(command), PROJECT_DIR), command).toBeDefined();
    }
  });

  test("blocks a read-only agent's call of a tool that writes", () => {
    for (const tool of WRITING_TOOLS) {
      for (const agent of ["qa-judge", "qa-reviewer", "vc:qa-explorer"]) {
        const input = { agent_type: agent, tool_name: tool, tool_input: { file_path: ".qa/judge/x.json" } };
        const reason = hookBlockReason(input, PROJECT_DIR);
        expect(reason).toMatch(/^[^\n]+$/);
        expect(reason).toContain(tool);
      }
    }
  });

  test("lets a read-only agent use the tools that only read", () => {
    for (const tool of ["Read", "Glob", "Grep", "Skill"]) {
      const input = { agent_type: "qa-judge", tool_name: tool, tool_input: { file_path: "tests/a.spec.ts" } };
      expect(hookBlockReason(input, PROJECT_DIR)).toBeUndefined();
    }
  });

  test("lets another agent and the main session use the writing tools", () => {
    for (const tool of WRITING_TOOLS) {
      expect(hookBlockReason({ agent_type: "qa-healer", tool_name: tool }, PROJECT_DIR)).toBeUndefined();
      expect(hookBlockReason({ tool_name: tool }, PROJECT_DIR)).toBeUndefined();
    }
  });

  test("blocks the judge writing through a link that leaves .qa/judge/", () => {
    const outside = mkdtempSync(join(tmpdir(), "judge-outside-"));
    const name = `link-test-${process.pid}`;
    const area = join(JUDGE_AREA, name);
    try {
      mkdirSync(join(area, "prove-abc"), { recursive: true });
      symlinkSync(outside, join(area, "prove-abc", "node_modules"), "junction");
      symlinkSync(outside, join(area, "elsewhere"), "junction");
      for (const file of [
        "prove-abc/node_modules/@playwright/test/cli.js",
        "prove-abc/node_modules",
        "elsewhere/x.json",
        "elsewhere/deeper/not-yet/x.json",
      ]) {
        const reason = hookBlockReason(judgeWrite(`.qa/judge/${name}/${file}`), PROJECT_DIR);
        expect(reason, file).toContain(".qa/judge/");
      }
      expect(hookBlockReason(judgeWrite(`.qa/judge/${name}/real/x.json`), PROJECT_DIR)).toBeUndefined();
    } finally {
      rmSync(area, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("blocks the explorer writing through a link that leaves .qa/reports/", () => {
    const outside = mkdtempSync(join(tmpdir(), "reports-outside-"));
    const name = `link-test-${process.pid}`;
    const area = join(REPORTS_AREA, name);
    try {
      mkdirSync(area, { recursive: true });
      symlinkSync(outside, join(area, "elsewhere"), "junction");
      for (const file of ["elsewhere/x.md", "elsewhere", "elsewhere/deeper/not-yet/x.md"]) {
        const reason = hookBlockReason(explorerWrite(`.qa/reports/${name}/${file}`), PROJECT_DIR);
        expect(reason, file).toContain(".qa/reports/");
      }
      expect(hookBlockReason(explorerWrite(`.qa/reports/${name}/real/x.md`), PROJECT_DIR)).toBeUndefined();
    } finally {
      rmSync(area, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("lets a write by another agent or the main session through", () => {
    const write = { tool_name: "Write", tool_input: { file_path: "tests/a.spec.ts" } };
    expect(hookBlockReason({ agent_type: "qa-automation-expert", ...write }, PROJECT_DIR)).toBeUndefined();
    expect(hookBlockReason({ agent_type: "qa-healer", ...write }, PROJECT_DIR)).toBeUndefined();
    expect(hookBlockReason(write, PROJECT_DIR)).toBeUndefined();
  });

  test("passes input that is not an object", () => {
    expect(hookBlockReason(null)).toBeUndefined();
    expect(hookBlockReason("text")).toBeUndefined();
    expect(hookBlockReason([])).toBeUndefined();
  });
});

function runHook(stdin: string, ...args: string[]): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync("node", [HOOK_FILE, ...args], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR },
  });
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

  test("lets the judge run its commands, and no other read-only agent", () => {
    const bash = (agent: string) =>
      runHook(JSON.stringify({ agent_type: agent, tool_name: "Bash", tool_input: { command: JUDGE_COMMAND } }));
    expect(bash("qa-judge").status).toBe(0);
    expect(bash("qa-reviewer").status).toBe(2);
  });

  test("lets the judge write under .qa/judge/ and blocks every other write, by the project directory", () => {
    const write = (agent: string, file: string) =>
      runHook(JSON.stringify({ agent_type: agent, tool_name: "Write", tool_input: { file_path: file } }));
    expect(write("qa-judge", ".qa/judge/x/judge-expert.json").status).toBe(0);
    const blocked = write("qa-judge", "tests/restapi/cart.spec.ts");
    expect(blocked.status).toBe(2);
    expect(blocked.stderr.trim()).toMatch(/^[^\n]+$/);
    expect(write("qa-reviewer", ".qa/judge/x.json").status).toBe(2);
    expect(write("qa-healer", "tests/restapi/cart.spec.ts").status).toBe(0);
  });

  test("lets the explorer write under .qa/reports/ and blocks every other write, by the project directory", () => {
    const write = (agent: string, file: string) =>
      runHook(JSON.stringify({ agent_type: agent, tool_name: "Write", tool_input: { file_path: file } }));
    expect(write("qa-explorer", ".qa/reports/explore-cart.md").status).toBe(0);
    const blocked = write("qa-explorer", "tests/restapi/cart.spec.ts");
    expect(blocked.status).toBe(2);
    expect(blocked.stderr.trim()).toMatch(/^[^\n]+$/);
    expect(write("qa-explorer", ".qa/judge/x.json").status).toBe(2);
    expect(write("qa-judge", ".qa/reports/explore-cart.md").status).toBe(2);
    expect(write("qa-coverage", ".qa/reports/x.md").status).toBe(2);
  });

  test("blocks the explorer writing under .qa/reports/ when the module cannot be loaded", () => {
    const result = runHook(
      JSON.stringify({ agent_type: "qa-explorer", tool_name: "Write", tool_input: { file_path: ".qa/reports/x.md" } }),
      "./no-such-module.mts",
    );
    expect(result.status).toBe(2);
  });

  test("blocks a read-only agent, even running git diff, when the module cannot be loaded", () => {
    const result = runHook(
      JSON.stringify({ agent_type: "qa-reviewer", tool_input: { command: "git diff" } }),
      "./no-such-module.mts",
    );
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toMatch(/^[^\n]+$/);
    expect(result.stderr).toContain("qa-reviewer");
  });

  test("blocks a plugin-prefixed read-only agent when the module cannot be loaded", () => {
    const result = runHook(
      JSON.stringify({ agent_type: "vc:qa-judge", tool_input: { command: "git diff" } }),
      "./no-such-module.mts",
    );
    expect(result.status).toBe(2);
  });

  test("blocks the judge writing under .qa/judge/ when the module cannot be loaded", () => {
    const result = runHook(
      JSON.stringify({ agent_type: "qa-judge", tool_name: "Write", tool_input: { file_path: ".qa/judge/x.json" } }),
      "./no-such-module.mts",
    );
    expect(result.status).toBe(2);
  });

  test("lets another agent and the main session through when the module cannot be loaded", () => {
    expect(
      runHook(JSON.stringify({ agent_type: "qa-healer", tool_input: { command: "git push" } }), "./no-such-module.mts")
        .status,
    ).toBe(0);
    expect(runHook(JSON.stringify({ tool_input: { command: "git push" } }), "./no-such-module.mts").status).toBe(0);
  });

  test("names the same read-only agents in the hook script as in the module, in both directions", () => {
    const listed = /const READ_ONLY_AGENTS = (\[[^\]]*\]);/.exec(readFileSync(HOOK_FILE, "utf8"))?.[1];
    expect(listed).toBeDefined();
    const parsed: unknown = JSON.parse(listed ?? "[]");
    const inHook = Array.isArray(parsed) ? parsed.map(String) : [];
    for (const name of inHook) {
      expect(READ_ONLY_AGENTS).toContain(name);
    }
    for (const name of READ_ONLY_AGENTS) {
      expect(inHook).toContain(name);
    }
    expect(inHook).toHaveLength(READ_ONLY_AGENTS.length);
  });

  test("registers the hook for the shell and every writing tool, and for no reading tool", () => {
    const matcher = /"matcher":\s*"([^"]*)"/.exec(readFileSync(SETTINGS_FILE, "utf8"))?.[1];
    expect(matcher?.split("|").sort()).toEqual(["Bash", "Edit", "MultiEdit", "NotebookEdit", "PowerShell", "Write"]);
  });

  test("blocks the judge's write through a link when run as the hook script", () => {
    const outside = mkdtempSync(join(tmpdir(), "judge-outside-"));
    const name = `link-hook-${process.pid}`;
    const area = join(JUDGE_AREA, name);
    try {
      mkdirSync(area, { recursive: true });
      symlinkSync(outside, join(area, "node_modules"), "junction");
      const result = runHook(JSON.stringify(judgeWrite(`.qa/judge/${name}/node_modules/x.json`)));
      expect(result.status).toBe(2);
    } finally {
      rmSync(area, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("passes input it cannot parse", () => {
    expect(runHook("not json").status).toBe(0);
    expect(runHook("").status).toBe(0);
  });
});
