import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { parseProjectFacts } from "../../../qa/project-facts.mts";
import { hookBlockReason, isHealerCommand, isReadOnlyCommand } from "../../../qa/readonly-shell.mts";

const HOOK_FILE = ".claude/hooks/readonly-shell.mts";
const PROJECT_DIR = resolve(process.cwd());
const BROWSER_PREFIX = "mcp__playwright__browser_";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const FACTS = {
  tracker: { kind: "jira", keyPattern: "^PRJ-\\d+$", routes: ["paste"] },
  docSources: [],
  commands: { typecheck: "npm run typecheck", lint: "npm run check", test: { unit: "npm run test:unit" } },
  critical: [],
  knowledgeDir: ".qa/kb",
  roles: { admin: "admin@example.com" },
  coverageWeights: { risk: 1, callFrequency: 1, runFrequency: 1, stability: 1, cost: 1 },
  flakyRunSeries: 5,
  quality: {
    maxSteps: 8,
    maxLines: 60,
    maxExpects: 12,
    maxNesting: 3,
    maxConditionals: 0,
    stableSeries: 3,
    durationBudgetMs: { restapi: 15000 },
    slowdownRatio: 1.5,
  },
  autonomy: { "*": "propose" },
  healerPaths: ["pages/", "dataset/"],
};

const ALLOWED_COMMANDS = [
  "npx --no playwright test tests/restapi/cart.spec.ts",
  "npx --no playwright test tests/restapi/cart.spec.ts --project=restapi --repeat-each=5 --retries=0 --reporter=list,json",
  "npx --no playwright test tests/e2e/cart.spec.ts tests/e2e/order.spec.ts --project=e2e-frontend --reporter=list,json",
  "npx --no playwright test tests/e2e/cart.spec.ts -g price.total --project=e2e-frontend",
  "npx --no playwright test tests/e2e/cart.spec.ts --grep=price",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-cart/report.restapi.json npx --no playwright test tests/restapi/cart.spec.ts --project=restapi --reporter=list,json",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-cart-page/round-1.e2e-frontend.json npx --no playwright test tests/a.spec.ts --retries=0 --reporter=list,json",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-cart/list.restapi.json npx --no playwright test --list --reporter=json tests/restapi/cart.spec.ts",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-cart/review-list.restapi.json npx --no playwright test --list --reporter=json --project=restapi",
  "node qa/expectation-guard.mts --snapshot",
  `node qa/expectation-guard.mts --base=${SHA}`,
  "node qa/expectation-guard.mts --base=0123456",
  "npx --no tsc --noEmit",
  "npx --no -- tsc --noEmit",
  "npx --no -- biome check pages",
  "npx --no -- playwright test tests/a.spec.ts --retries=0",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-cart/list.restapi.json npx --no -- playwright test --list --reporter=json",
  "npx --no biome check pages/cart-page.ts dataset/arrange/cart.ts",
  "npx --no biome check pages dataset",
  "node qa/project-facts.mts",
  "node qa/reconcile-run.mts .qa/runs/heal-cart/list.json .qa/runs/heal-cart/report.json",
  "git diff",
  "git status --short",
  "git log --oneline -n 5",
  "git show HEAD~1",
];

const REFUSED_COMMANDS = [
  "npx playwright test tests/restapi/cart.spec.ts",
  "npx tsc --noEmit",
  "npx biome check pages",
  "npx --yes tsc --noEmit",
  "npx -y tsc --noEmit",
  "npx --no --yes tsc --noEmit",
  "npx --no -y biome check pages",
  "npx --no=false tsc --noEmit",
  "npx -- tsc --noEmit",
  "npx --no -- -- tsc --noEmit",
  "npx --no -- --yes tsc --noEmit",
  "npx -- --no tsc --noEmit",
  "npx --no npx tsc --noEmit",
  "npx --no rimraf pages",
  "npx --no playwright install",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/cart/review-list.restapi.json npx --no playwright test --list --reporter=json --project=restapi",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-cart/../cart/review-list.restapi.json npx --no playwright test --list --reporter=json",
  "node qa/expectation-guard.mts --repo-fingerprint",
  "git config filter.h.clean x",
  "git config --global core.fsmonitor x",
  "git config core.fsmonitor x",
  "git add -A",
  "git add pages/x.ts",
  "git commit -m x",
  "git stash create",
  "git stash",
  "git checkout pages/x.ts",
  "git restore pages/x.ts",
  "git reset --hard",
  "git update-index --assume-unchanged x",
  "git -c core.fsmonitor=x status",
  "git -c filter.h.clean=x diff",
  "git push",
  "git diff --output=x",
  "git diff --ext-diff",
  "npx --no playwright test --update-snapshots",
  "npx --no playwright test tests/a.spec.ts -u",
  "npx --no playwright test tests/a.spec.ts --config=x.ts",
  "npx --no playwright test tests/a.spec.ts --config x.ts",
  "npx --no playwright test tests/a.spec.ts -c x.ts",
  "npx --no playwright test tests/a.spec.ts --output=x",
  "npx --no playwright test tests/a.spec.ts --reporter=html",
  "npx --no playwright test tests/a.spec.ts --reporter=list,html",
  "npx --no playwright test tests/a.spec.ts --reporter=json --reporter=list",
  "npx --no playwright test tests/a.spec.ts --retries=2",
  "npx --no playwright test tests/a.spec.ts --workers=1",
  "npx --no playwright test tests/a.spec.ts --repeat-each=x",
  "npx --no playwright test tests/a.spec.ts --repeat-each=",
  "npx --no playwright test tests/a.spec.ts -g",
  "npx --no playwright test tests/a.spec.ts -g --list",
  "npx --no playwright test tests/a.spec.ts --grep=",
  "npx --no playwright test tests/../x.spec.ts",
  "npx --no playwright test /etc/x.spec.ts",
  "npx --no playwright test tests/a.spec.ts --global-setup=x.ts",
  "npx --no playwright test tests/a.spec.ts --ui",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/other/x.json npx --no playwright test tests/a.spec.ts",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-x/../../x.json npx --no playwright test tests/a.spec.ts",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=../x.json npx --no playwright test tests/a.spec.ts",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-x/x.txt npx --no playwright test tests/a.spec.ts",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-x/a/b.json npx --no playwright test tests/a.spec.ts",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-x/x.json node qa/expectation-guard.mts --snapshot",
  "PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-x/x.json npx --no tsc --noEmit",
  "NODE_OPTIONS=x npx --no playwright test tests/a.spec.ts",
  "node qa/expectation-guard.mts",
  "node qa/expectation-guard.mts --base=HEAD",
  "node qa/expectation-guard.mts --base=--output=x",
  `node qa/expectation-guard.mts --snapshot --base=${SHA}`,
  "node qa/expectation-guard.mts --fix",
  "node qa/prove-fails.mts tests/a.spec.ts 12 a title",
  "node qa/judge-verdict.mts",
  "node qa/other.mts",
  "node pages/x.mts",
  "node ../qa/expectation-guard.mts --snapshot",
  "npx --no tsc",
  "npx --no tsc --noEmit --outDir x",
  "npx --no tsc --noEmit -p x",
  "npx --no biome check --write pages",
  "npx --no biome check pages --write",
  "npx --no biome check --fix pages",
  "npx --no biome check --unsafe pages",
  "npx --no biome check",
  "npx --no biome check ../x",
  "npx --no biome check /etc",
  "npx --no biome format pages",
  "npx --no biome lint pages",
  "npx --no biome check pages; rm x",
  "npx --no tsc --noEmit && rm x",
  "npx --no tsc --noEmit | tee x",
  "npx --no tsc --noEmit > x",
  "npx --no tsc --noEmit $(rm x)",
  "npm run check",
  "npm test",
  "rm -rf pages",
  "curl http://example.com",
  "",
];

function healerCall(tool: string, input: unknown): Record<string, unknown> {
  return { agent_type: "qa-healer", tool_name: tool, tool_input: input };
}

function runHook(stdin: string, ...args: string[]): { status: number | null; stderr: string } {
  const result = spawnSync("node", [HOOK_FILE, ...args], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR },
  });
  return { status: result.status, stderr: result.stderr };
}

test.describe("healer Bash allowlist", () => {
  for (const command of ALLOWED_COMMANDS) {
    test(`allows ${JSON.stringify(command)}`, () => {
      expect(isHealerCommand(command) || isReadOnlyCommand(command, "qa-healer")).toBe(true);
      expect(hookBlockReason(healerCall("Bash", { command }), PROJECT_DIR)).toBeUndefined();
    });
  }

  for (const command of REFUSED_COMMANDS) {
    test(`refuses ${JSON.stringify(command)}`, () => {
      expect(isHealerCommand(command) || isReadOnlyCommand(command, "qa-healer")).toBe(false);
      const reason = hookBlockReason(healerCall("Bash", { command }), PROJECT_DIR);
      expect(reason).toMatch(/^[^\n]+$/);
      expect(reason).toContain("qa-healer");
    });
  }

  test("refuses a Bash call with no command", () => {
    expect(hookBlockReason(healerCall("Bash", {}), PROJECT_DIR)).toContain("qa-healer");
    expect(hookBlockReason(healerCall("Bash", { command: 5 }), PROJECT_DIR)).toContain("qa-healer");
    expect(hookBlockReason(healerCall("Bash", null), PROJECT_DIR)).toContain("qa-healer");
  });

  test("the commands are the healer's alone: no other agent gets them", () => {
    for (const command of [
      `node qa/expectation-guard.mts --base=${SHA}`,
      "npx --no tsc --noEmit",
      "npx --no biome check pages",
    ]) {
      for (const agent of ["qa-reviewer", "qa-explorer", "qa-judge", "qa-coverage"]) {
        expect(
          hookBlockReason({ agent_type: agent, tool_name: "Bash", tool_input: { command } }, PROJECT_DIR),
        ).toContain(agent);
      }
      expect(
        hookBlockReason({ agent_type: "qa-planner", tool_name: "Bash", tool_input: { command } }, PROJECT_DIR),
      ).toBe(undefined);
    }
  });
});

test("the repository fingerprint is the main session's: the healer and the read-only agents may not run it", () => {
  const command = "node qa/expectation-guard.mts --repo-fingerprint";
  for (const agent of ["qa-healer", "vc:qa-healer", "qa-reviewer", "qa-explorer", "qa-judge", "qa-coverage"]) {
    expect(hookBlockReason({ agent_type: agent, tool_name: "Bash", tool_input: { command } }, PROJECT_DIR)).toContain(
      agent,
    );
  }
  expect(hookBlockReason({ tool_name: "Bash", tool_input: { command } }, PROJECT_DIR)).toBeUndefined();
});

test.describe("healer writes", () => {
  let project = "";
  let outside = "";

  test.beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "healer-project-"));
    outside = mkdtempSync(join(tmpdir(), "healer-outside-"));
    mkdirSync(join(project, ".qa"), { recursive: true });
    mkdirSync(join(project, "pages"), { recursive: true });
    mkdirSync(join(project, "dataset"), { recursive: true });
    writeFileSync(join(project, ".qa", "project.json"), JSON.stringify(FACTS));
  });

  test.afterEach(() => {
    rmSync(project, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  const ALLOWED = [
    "pages/cart-page.ts",
    "pages/deep/er/cart-page.ts",
    "dataset/arrange/cart.ts",
    "pages/not-yet-there/new-page.ts",
    "pages/./cart-page.ts",
    ".qa/reports/heal-cart.md",
    ".qa/reports/heal-cart-page-2.md",
    ".qa/reports/flaky.md",
    ".qa/runs/heal-cart/baseline.txt",
    ".qa/runs/heal-cart/sub/x.json",
  ];

  const REFUSED = [
    ".git/info/attributes",
    ".git/config",
    ".git/hooks/pre-commit",
    ".GIT/info/attributes",
    ".Git/config",
    "pages/.gitattributes",
    "pages/.gitignore",
    "pages/.GITATTRIBUTES",
    "pages/.git/x",
    "pages/.Git/x",
    "dataset/.gitmodules",
    "tests/e2e/cart.spec.ts",
    "known-issues.json",
    "playwright.config.ts",
    "fixtures/known-issue.ts",
    "qa/expectation-guard.mts",
    "qa/readonly-shell.mts",
    ".qa/project.json",
    ".qa/kb/x.md",
    ".claude/agents/qa-healer.md",
    ".claude/hooks/readonly-shell.mts",
    ".claude/settings.json",
    ".env",
    "package.json",
    ".qa/reports/explore-cart.md",
    ".qa/reports/heal-cart.md.ts",
    ".qa/reports/heal-.md",
    ".qa/reports/HEAL-cart.md",
    ".qa/reports/heal-Cart.md",
    ".qa/reports/heal-cart/notes.md",
    ".qa/reports/heal-cart.md:x",
    ".qa/reports/flaky.md.ts",
    ".qa/reports/flaky-x.md",
    ".qa/reports/x.md",
    ".qa/reports",
    ".qa/runs/other/x.txt",
    ".qa/runs/heal-cart",
    ".qa/runs/heal-/x.txt",
    ".qa/runs/heal-cart/x:y",
    ".qa/runs/x/heal-cart/x.txt",
    ".qa/runs/review-x/x.txt",
    ".qa/judge/x/judge-expert.json",
    "pages-extra/x.ts",
    "pages",
    "pages/",
    "datasets/x.ts",
    "pages/../tests/e2e/cart.spec.ts",
    "pages/../.git/config",
    "pages/cart-page.ts:stream",
    "pages/CART-P~1.TS",
    "pages/deep/A~1/x.ts",
    "PAGES~1/x.ts",
    ".qa/runs/heal-cart/X~1/y.json",
    ".qa/reports/HEAL-C~1.MD",
    "GIT~1/config",
    "../outside.ts",
    "../pages/x.ts",
    "/etc/passwd",
    "C:\\Windows\\x.ts",
    "D:/pages/x.ts",
    "\\\\server\\share\\x.ts",
    "",
  ];

  for (const tool of ["Write", "Edit", "MultiEdit"]) {
    for (const file of ALLOWED) {
      test(`lets the healer ${tool} ${file}`, () => {
        expect(hookBlockReason(healerCall(tool, { file_path: file }), project)).toBeUndefined();
        expect(
          hookBlockReason({ ...healerCall(tool, { file_path: file }), agent_type: "vc:qa-healer" }, project),
        ).toBeUndefined();
      });
    }

    for (const file of REFUSED) {
      test(`blocks the healer's ${tool} of ${JSON.stringify(file)}`, () => {
        const reason = hookBlockReason(healerCall(tool, { file_path: file }), project);
        expect(reason).toMatch(/^[^\n]+$/);
        expect(reason).toContain("qa-healer");
      });
    }

    test(`blocks the healer's ${tool} with no or a wrong file_path`, () => {
      for (const input of [{}, { file_path: 5 }, { file_path: null }, null, "x", { path: "pages/x.ts" }]) {
        expect(hookBlockReason(healerCall(tool, input), project)).toContain("qa-healer");
      }
    });
  }

  test("blocks an absolute path inside the project that is not allowed, and allows one that is", () => {
    expect(
      hookBlockReason(healerCall("Write", { file_path: join(project, "pages", "x.ts") }), project),
    ).toBeUndefined();
    expect(hookBlockReason(healerCall("Write", { file_path: join(project, "tests", "x.spec.ts") }), project)).toContain(
      "qa-healer",
    );
    expect(hookBlockReason(healerCall("Write", { file_path: join(project, ".git", "config") }), project)).toContain(
      "qa-healer",
    );
  });

  test("blocks NotebookEdit and PowerShell", () => {
    for (const tool of ["NotebookEdit", "PowerShell"]) {
      expect(hookBlockReason(healerCall(tool, { file_path: "pages/x.ts", command: "x" }), project)).toContain(
        "qa-healer",
      );
    }
  });

  test("blocks a write through a junction that leaves the healer path", () => {
    symlinkSync(outside, join(project, "pages", "link"), "junction");

    for (const file of ["pages/link/x.ts", "pages/link/deeper/x.ts"]) {
      expect(hookBlockReason(healerCall("Write", { file_path: file }), project), file).toContain("qa-healer");
    }
  });

  test("blocks a write through a junction that points at .git", () => {
    mkdirSync(join(project, ".git", "info"), { recursive: true });
    symlinkSync(join(project, ".git"), join(project, "pages", "g"), "junction");

    expect(hookBlockReason(healerCall("Write", { file_path: "pages/g/info/attributes" }), project)).toContain(
      "qa-healer",
    );
  });

  test("blocks a write through a junction in .qa/reports and in .qa/runs", () => {
    mkdirSync(join(project, ".qa", "reports"), { recursive: true });
    mkdirSync(join(project, ".qa", "runs"), { recursive: true });
    symlinkSync(outside, join(project, ".qa", "runs", "heal-link"), "junction");

    expect(hookBlockReason(healerCall("Write", { file_path: ".qa/runs/heal-link/x.txt" }), project)).toContain(
      "qa-healer",
    );
  });

  test("blocks every write when the facts cannot be read, are broken or lack healerPaths", () => {
    const { healerPaths: _ignored, ...withoutPaths } = FACTS;
    for (const content of [
      undefined,
      "not json",
      JSON.stringify(withoutPaths),
      JSON.stringify({ ...FACTS, healerPaths: [".."] }),
    ]) {
      if (content === undefined) {
        rmSync(join(project, ".qa", "project.json"));
      } else {
        writeFileSync(join(project, ".qa", "project.json"), content);
      }
      for (const file of ["pages/x.ts", ".qa/reports/heal-cart.md", ".qa/runs/heal-cart/x.txt"]) {
        const reason = hookBlockReason(healerCall("Write", { file_path: file }), project);
        expect(reason, `${content ?? "missing"} ${file}`).toContain("qa-healer");
      }
    }
  });

  test("reads healerPaths at hook time: another configured path is allowed, the old one is not", () => {
    writeFileSync(join(project, ".qa", "project.json"), JSON.stringify({ ...FACTS, healerPaths: ["src/pages"] }));

    expect(hookBlockReason(healerCall("Write", { file_path: "src/pages/x.ts" }), project)).toBeUndefined();
    expect(hookBlockReason(healerCall("Write", { file_path: "pages/x.ts" }), project)).toContain("qa-healer");
  });

  test("an empty healerPaths list leaves only the report and run files", () => {
    writeFileSync(join(project, ".qa", "project.json"), JSON.stringify({ ...FACTS, healerPaths: [] }));

    expect(hookBlockReason(healerCall("Write", { file_path: "pages/x.ts" }), project)).toContain("qa-healer");
    expect(hookBlockReason(healerCall("Write", { file_path: ".qa/reports/heal-cart.md" }), project)).toBeUndefined();
  });
});

test.describe("healer writes and the git hooks folder", () => {
  let project = "";

  function gitIn(...args: string[]): void {
    spawnSync("git", args, { cwd: project, stdio: "ignore" });
  }

  function write(file: string): string | undefined {
    return hookBlockReason(healerCall("Write", { file_path: file }), project);
  }

  test.beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "healer-hooks-"));
    gitIn("init", "-q");
    mkdirSync(join(project, ".qa"), { recursive: true });
    mkdirSync(join(project, "pages", "hooks"), { recursive: true });
    writeFileSync(join(project, ".qa", "project.json"), JSON.stringify(FACTS));
  });

  test.afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  test("a repository without core.hooksPath leaves the healer paths writable", () => {
    expect(write("pages/x.ts")).toBeUndefined();
    expect(write("pages/hooks/x.ts")).toBeUndefined();
  });

  test("a core.hooksPath inside a healer path is not writable, the rest of the path is", () => {
    gitIn("config", "core.hooksPath", "pages/hooks");

    const files = ["pages/hooks/pre-commit", "pages/hooks/sub/x.ts"];
    for (const file of process.platform === "win32" ? [...files, "pages/HOOKS/pre-commit"] : files) {
      expect(write(file), file).toContain("qa-healer");
    }
    expect(write("pages/x.ts")).toBeUndefined();
    expect(write("pages/hooks-extra/x.ts")).toBeUndefined();
  });

  test("an absolute core.hooksPath inside a healer path is not writable", () => {
    gitIn("config", "core.hooksPath", join(project, "dataset", "git-hooks").replaceAll("\\", "/"));

    expect(write("dataset/git-hooks/pre-push")).toContain("qa-healer");
    expect(write("dataset/arrange/x.ts")).toBeUndefined();
  });

  test("a core.hooksPath that is the healer path itself makes the whole path unwritable", () => {
    gitIn("config", "core.hooksPath", "pages");

    expect(write("pages/x.ts")).toContain("qa-healer");
  });

  test("a repository whose git configuration cannot be read blocks every healer write", () => {
    writeFileSync(join(project, ".git", "config"), "[core\nbroken");

    expect(write("pages/x.ts")).toContain("qa-healer");
    expect(write(".qa/reports/heal-cart.md")).toContain("qa-healer");
  });
});

test.describe("healer other tools", () => {
  test("lets the reading tools pass", () => {
    for (const tool of ["Read", "Grep", "Glob", "Skill"]) {
      expect(hookBlockReason(healerCall(tool, { file_path: ".env" }), PROJECT_DIR)).toBeUndefined();
    }
  });

  test("keeps the existing browser rules: the listed tools pass, an upload, a submit and another server do not", () => {
    const call = (tool: string, input: unknown): string | undefined =>
      hookBlockReason(healerCall(`${BROWSER_PREFIX}${tool}`, input), PROJECT_DIR);

    expect(call("snapshot", {})).toBeUndefined();
    expect(call("click", { target: "e1" })).toBeUndefined();
    expect(call("navigate", { url: "https://example.com" })).toBeUndefined();
    expect(call("file_upload", {})).toContain("qa-healer");
    expect(call("run_code_unsafe", {})).toContain("qa-healer");
    expect(call("type", { text: "x", submit: true })).toContain("qa-healer");
    expect(call("navigate", { url: "file:///etc/passwd" })).toContain("qa-healer");
    expect(hookBlockReason(healerCall("mcp__kb__kb_capture", {}), PROJECT_DIR)).toContain("qa-healer");
  });

  test("another agent and the main session are not limited", () => {
    const write = { tool_name: "Write", tool_input: { file_path: "tests/a.spec.ts" } };
    expect(hookBlockReason({ agent_type: "qa-planner", ...write }, PROJECT_DIR)).toBeUndefined();
    expect(hookBlockReason(write, PROJECT_DIR)).toBeUndefined();
  });
});

test.describe("healer hook script", () => {
  test("blocks the healer's git config and its write to .git/info/attributes, and passes its allowed work", () => {
    const bash = (command: string): number | null => runHook(JSON.stringify(healerCall("Bash", { command }))).status;
    const write = (file: string): number | null =>
      runHook(JSON.stringify(healerCall("Write", { file_path: file }))).status;

    expect(bash("git config filter.h.clean x")).toBe(2);
    expect(bash("npx --no tsc --noEmit")).toBe(0);
    expect(write(".git/info/attributes")).toBe(2);
    expect(write("tests/restapi/cart.spec.ts")).toBe(2);
    expect(write("pages/frontend/pages/cart/cart-page.ts")).toBe(0);
    expect(write(".qa/reports/heal-cart.md")).toBe(0);
  });

  test("blocks the healer, and a plugin-prefixed healer, when the module cannot be loaded", () => {
    for (const agent of ["qa-healer", "vc:qa-healer"]) {
      const input = { agent_type: agent, tool_name: "Write", tool_input: { file_path: "pages/x.ts" } };

      expect(runHook(JSON.stringify(input), "./no-such-module.mts").status, agent).toBe(2);
    }
  });
});

test.describe("healer paths in the project facts", () => {
  test("rejects a file without healerPaths", () => {
    const { healerPaths: _ignored, ...rest } = FACTS;

    expect(() => parseProjectFacts(rest)).toThrow("project.json: healerPaths is missing");
  });

  test("rejects a healer path that is absolute or leaves the repository", () => {
    for (const path of ["/etc", "../outside/", "pages/../../x", ""]) {
      expect(() => parseProjectFacts({ ...FACTS, healerPaths: [path] }), path).toThrow("project.json: healerPaths[0]");
    }
  });

  test("rejects the repository root, rooted, drive and UNC forms, git, qa, tooling and short-name segments", () => {
    for (const path of [
      ".",
      "./",
      ".\\",
      ".git",
      ".git/",
      ".GIT/hooks",
      ".gitattributes",
      "pages/.git/x",
      "pages/.gitignore",
      ".qa/",
      ".QA/runs",
      "pages/.qa",
      "qa",
      "qa/",
      "QA",
      "pages/qa",
      "node_modules",
      "pages/node_modules/",
      ".claude",
      ".claude/hooks",
      "pages/.claude",
      "\\Users\\x",
      "\\\\server\\x",
      "//server/x",
      "C:/x",
      "c:pages",
      "GIT~1/config",
      "pages/PAGES~2",
      "pages\\x",
      "pages//x",
      "pages/./x",
      "pages/..",
      "pages x/",
      "pages/*",
      "-pages",
    ]) {
      expect(() => parseProjectFacts({ ...FACTS, healerPaths: [path] }), path).toThrow("project.json: healerPaths[0]");
    }
  });

  test("accepts a plain relative directory, with or without its trailing slash", () => {
    for (const path of ["pages/", "dataset", "tests/", "src/page-objects/v1.2/", "a_b-c"]) {
      expect(parseProjectFacts({ ...FACTS, healerPaths: [path] }).healerPaths, path).toEqual([path]);
    }
  });

  test("a healer path list may be empty", () => {
    expect(parseProjectFacts({ ...FACTS, healerPaths: [] }).healerPaths).toEqual([]);
  });
});
