import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  findAddedSuppressions,
  findChangedExpectations,
  findOutsideHealerPaths,
} from "../../../qa/expectation-guard.mts";

const GUARD = resolve("qa/expectation-guard.mts");
const SPEC = "tests/e2e/cart.spec.ts";
const PAGE = "pages/cart-page.ts";
const HELPER = "dataset/arrange/cart.ts";
const KNOWN_ISSUES = "known-issues.json";
const FACTS = ".qa/project.json";
const HEALER_PATHS = ["pages/", "dataset/"];
const TEMP_PREFIX = "expectation-guard-";
const GIT_IDENTITY = [
  "-c",
  "user.name=guard",
  "-c",
  "user.email=guard@example.com",
  "-c",
  "commit.gpgsign=false",
  "-c",
  "core.autocrlf=false",
];
const FACTS_FILE = {
  tracker: { kind: "jira", keyPattern: "^PRJ-\\d+$", routes: ["paste"] },
  docSources: [],
  commands: { typecheck: "npm run typecheck", lint: "npm run check", test: { unit: "npm run test:unit" } },
  critical: [],
  knowledgeDir: ".qa/kb",
  roles: { admin: "admin@example.com" },
  coverageWeights: { risk: 1, callFrequency: 1, runFrequency: 1, stability: 1, cost: 1 },
  flakyRunSeries: 5,
  autonomy: { "*": "propose" },
  healerPaths: HEALER_PATHS,
};
const PRICE_SPEC = (value: number): string =>
  `test("price", async () => {\n  const price = await cart.price();\n  expect(price).toBe(${value});\n});\n`;
const PAGE_OBJECT = (locator: string): string =>
  `export const total = page.${locator};\nexport async function check() {\n  await expect(total).toHaveText("10");\n}\n`;
const HELPER_FILE = (value: number): string =>
  `export async function totalIs(cart) {\n  expectTotal(cart, ${value});\n}\n`;

function diffOf(file: string, hunk: string): string {
  return `diff --git a/${file} b/${file}\nindex 1111111..2222222 100644\n--- a/${file}\n+++ b/${file}\n${hunk}\n`;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", [...GIT_IDENTITY, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function write(cwd: string, file: string, text: string): void {
  mkdirSync(dirname(join(cwd, file)), { recursive: true });
  writeFileSync(join(cwd, file), text);
}

function runFromBaseline(cwd: string, tree: string): { status: number | null; stdout: string; stderr: string } {
  const directory = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
  try {
    const archive = execFileSync("git", ["archive", "--format=tar", tree, "qa"], { cwd, maxBuffer: 64 * 1024 * 1024 });
    spawnSync("tar", ["-x", "-C", directory], { input: archive });
    const result = spawnSync("node", [join(directory, "qa", "expectation-guard.mts"), `--base=${tree}`], {
      cwd,
      encoding: "utf8",
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runGuard(cwd: string, ...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", [GUARD, ...args], { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test.describe("expectation guard", () => {
  test("a changed toBe value is found", () => {
    const diff = diffOf(
      SPEC,
      [
        "@@ -3,4 +3,4 @@ test",
        '   const price = await cart.price("item");',
        "-  expect(price).toBe(10);",
        "+  expect(price).toBe(12);",
        " });",
      ].join("\n"),
    );

    expect(findChangedExpectations(diff)).toEqual([{ file: SPEC, line: "  expect(price).toBe(10);" }]);
  });

  test("a removed expect line is found", () => {
    const diff = diffOf(
      SPEC,
      ["@@ -1,3 +1,2 @@", " test(() => {", "-  await expect(page).toHaveURL(/cart/);", " });"].join("\n"),
    );

    expect(findChangedExpectations(diff)).toHaveLength(1);
  });

  test("a changed locator in a page object is not a finding", () => {
    const diff = diffOf(
      PAGE,
      [
        "@@ -1,2 +1,2 @@",
        '-  readonly total = this.page.locator("#total");',
        '+  readonly total = this.page.getByTestId("total");',
        " }",
      ].join("\n"),
    );

    expect(findChangedExpectations(diff)).toEqual([]);
  });

  test("a changed toHaveText in a page object is found", () => {
    const diff = diffOf(
      PAGE,
      ["@@ -1,2 +1,2 @@", '-  await total.toHaveText("10");', '+  await total.toHaveText("12");', " }"].join("\n"),
    );

    expect(findChangedExpectations(diff)).toEqual([{ file: PAGE, line: '  await total.toHaveText("10");' }]);
  });

  test("a changed helper call is found", () => {
    const calls = [
      "  expectTotal(cart, 10);",
      "  await cart.expectTotal(10);",
      "  await cart.verifyTotal(10);",
      "  cart.assertPrice(10);",
    ];

    for (const call of calls) {
      const diff = diffOf(HELPER, ["@@ -1,2 +1,2 @@", `-${call}`, `+${call.replace("10", "12")}`, " }"].join("\n"));

      expect(findChangedExpectations(diff), call).toEqual([{ file: HELPER, line: call }]);
    }
  });

  test("an added test is not a finding", () => {
    const diff = diffOf(
      SPEC,
      ["@@ -1,1 +1,4 @@", " import { test } from 'x';", '+test("new", () => {', "+  expect(1).toBe(1);", "+});"].join(
        "\n",
      ),
    );

    expect(findChangedExpectations(diff)).toEqual([]);
  });

  test("an assert step and a matcher on its own line are found", () => {
    const diff = diffOf(
      SPEC,
      [
        "@@ -1,5 +1,5 @@",
        '-  await test.step("assert: the total is 10", async () => {',
        '+  await test.step("assert: the total is 12", async () => {',
        '-  ).toHaveText("10");',
        '+  ).toHaveText("12");',
        " });",
      ].join("\n"),
    );

    expect(findChangedExpectations(diff).map((finding) => finding.line)).toEqual([
      '  await test.step("assert: the total is 10", async () => {',
      '  ).toHaveText("10");',
    ]);
  });

  test("a changed value inside a multi-line expectation is found", () => {
    const diff = diffOf(
      SPEC,
      [
        "@@ -2,6 +2,6 @@",
        "   expect(order).toEqual({",
        '     status: "new",',
        "-    total: 10,",
        "+    total: 12,",
        "   });",
        "   await cart.clear();",
      ].join("\n"),
    );

    expect(findChangedExpectations(diff)).toEqual([{ file: SPEC, line: "    total: 10," }]);
  });

  test("a changed line after a closed expectation is not a finding", () => {
    const diff = diffOf(
      SPEC,
      [
        "@@ -2,5 +2,5 @@",
        "   expect(order).toEqual({",
        '     status: "new",',
        "   });",
        "-  await cart.waitForTimeout(100);",
        "+  await cart.waitForTimeout(500);",
      ].join("\n"),
    );

    expect(findChangedExpectations(diff)).toEqual([]);
  });

  test("a changed expected value of a table row or a constant is found", () => {
    const lines = ["  { quantity: 2, expectedTotal: 20 },", "const expectedTotal = 20;"];

    for (const line of lines) {
      const diff = diffOf(HELPER, ["@@ -1,2 +1,2 @@", `-${line}`, `+${line.replace("20", "22")}`, " ];"].join("\n"));

      expect(findChangedExpectations(diff), line).toHaveLength(1);
    }
  });

  test("a removed line starting with dashes is read as content, not as a file header", () => {
    const diff = diffOf(SPEC, ["@@ -1,3 +1,2 @@", " a", "--- expect(x).toBe(1);", " b"].join("\n"));

    expect(findChangedExpectations(diff)).toEqual([{ file: SPEC, line: "-- expect(x).toBe(1);" }]);
  });

  test("findings carry the file of their own section", () => {
    const diff = `${diffOf(PAGE, "@@ -1,1 +1,1 @@\n-  const a = 1;\n+  const a = 2;")}${diffOf(
      "tests/api/orders.spec.ts",
      "@@ -1,1 +1,1 @@\n-  expect(b).toBe(1);\n+  expect(b).toBe(2);",
    )}`;

    expect(findChangedExpectations(diff)).toEqual([{ file: "tests/api/orders.spec.ts", line: "  expect(b).toBe(1);" }]);
  });

  test("a deleted file is found", () => {
    const deleted = `diff --git a/${SPEC} b/${SPEC}\ndeleted file mode 100644\nindex 1111111..0000000\n--- a/${SPEC}\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-test(() => {\n-  expect(a).toBe(1);\n`;

    expect(findChangedExpectations(deleted)).toEqual([{ file: SPEC, line: "  expect(a).toBe(1);" }]);
  });

  test("an empty diff has no findings", () => {
    expect(findChangedExpectations("")).toEqual([]);
  });
});

test.describe("added suppressions", () => {
  const SUPPRESSIONS = [
    'test.skip(true, "later");',
    'test.fixme(true, "later");',
    "test.fail();",
    "test.slow();",
    "test.setTimeout(999999);",
    "test.describe.configure({ retries: 3 });",
    'test.describe.skip("x", () => {});',
    "await page.waitForTimeout(500);",
    'await page.waitForLoadState("networkidle");',
    "expect.extend({});",
    "await expect.poll(() => read()).toBe(1);",
    "expect.configure({ timeout: 99999 });",
    "try { await x(); } catch {",
    "await locator.click().catch(() => {});",
    "process.exit(0);",
    "try { await x(); } catch (e) {}",
    "try { await x(); } catch (error) { }",
    "await locator.click().catch((e) => {});",
    "await locator.click().catch((_error) => undefined);",
    "await locator.click().catch(async () => {});",
    "await locator.click().catch(noop);",
    "await new Promise((r) => setTimeout(r, 500));",
    "await new Promise(resolve => setTimeout(resolve, 100));",
    "await locator.click({ force: true });",
    'test["skip"](true);',
    "test['fixme']();",
    'test.describe["configure"]({ retries: 2 });',
    "const options = { retries: 3 };",
    "await locator.click({ timeout: 60000 });",
    'import { writeFileSync } from "node:fs";',
    'import * as fs from "fs";',
    'import { readFile } from "node:fs/promises";',
    'import { execSync } from "node:child_process";',
    "import cp from 'child_process';",
    'import "node:fs";',
    'const fs = require("fs");',
    'const cp = require ( "node:child_process" );',
    "const m = require(name);",
    'const m = await import("./x.mts");',
    "const m = await import (name);",
    "const token = process.env.TOKEN;",
    'const token = process.env["TOKEN"];',
    "const all = process . env;",
    'writeFileSync("x", "y");',
    'appendFileSync("x", "y");',
    'rmSync("x", { recursive: true });',
    'unlinkSync("x");',
    'execSync("x");',
    'spawn("x");',
    'spawnSync("x");',
    "testInfo.skip();",
    'testInfo.fixme(true, "later");',
    "testInfo.fail();",
    "testInfo . skip ( );",
    "test.info().skip();",
    "test.info().fixme();",
    "test . info ( ) . fail ( );",
    "test\t.\tskip(true);",
  ];

  for (const line of SUPPRESSIONS) {
    test(`an added ${line} is found`, () => {
      const diff = diffOf(PAGE, ["@@ -1,1 +1,2 @@", " a", `+  ${line}`].join("\n"));

      expect(findAddedSuppressions(diff)).toEqual([{ file: PAGE, line: `  ${line}` }]);
    });
  }

  test("a plain import, a page call and a test title are not findings", () => {
    const diff = diffOf(
      PAGE,
      [
        "@@ -1,1 +1,4 @@",
        " a",
        '+import { CartPage } from "./cart-page.ts";',
        '+await page.getByRole("button", { name: "Import" }).click();',
        '+test("imports a file", async () => {});',
      ].join("\n"),
    );

    expect(findAddedSuppressions(diff)).toEqual([]);
  });

  test("a removed suppression, a bare return and a bare throw are not findings", () => {
    const diff = diffOf(
      PAGE,
      ["@@ -1,3 +1,3 @@", "-  test.skip(true);", "+  return;", '+  throw new Error("x");', " }"].join("\n"),
    );

    expect(findAddedSuppressions(diff)).toEqual([]);
  });

  test("findings carry the file of their own section", () => {
    const diff = `${diffOf(PAGE, "@@ -1,1 +1,2 @@\n a\n+  test.skip();")}${diffOf(HELPER, "@@ -1,1 +1,2 @@\n a\n+  const b = 1;")}`;

    expect(findAddedSuppressions(diff)).toEqual([{ file: PAGE, line: "  test.skip();" }]);
  });
});

test.describe("healer paths", () => {
  test("a spec, a config, fixtures, known issues, env files, tooling and manifests are outside", () => {
    const outside = [
      SPEC,
      "tests/e2e/cart.test.ts",
      KNOWN_ISSUES,
      "playwright.config.ts",
      "fixtures/known-issue.ts",
      ".env",
      ".env.local",
      ".qa/project.json",
      "qa/expectation-guard.mts",
      ".claude/agents/qa-healer.md",
      "package.json",
      "package-lock.json",
    ];

    expect(findOutsideHealerPaths(outside, HEALER_PATHS)).toEqual(outside);
  });

  test("files under a healer path are inside, a sibling with the same prefix is not", () => {
    expect(findOutsideHealerPaths([PAGE, HELPER, "pages/deep/a/b.ts"], HEALER_PATHS)).toEqual([]);
    expect(findOutsideHealerPaths(["pages-extra/a.ts", "datasets/a.ts"], HEALER_PATHS)).toEqual([
      "pages-extra/a.ts",
      "datasets/a.ts",
    ]);
  });

  test("a path without its trailing slash means the same directory", () => {
    expect(findOutsideHealerPaths([PAGE], ["pages"])).toEqual([]);
  });

  test("no healer path allows nothing", () => {
    expect(findOutsideHealerPaths([PAGE], [])).toEqual([PAGE]);
  });
});

test.describe("expectation guard CLI", () => {
  let repo = "";
  let baseline = "";

  function snapshot(): string {
    const result = runGuard(repo, "--snapshot");
    expect(result.status).toBe(0);
    return result.stdout.trim();
  }

  test.beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
    git(repo, "init", "-q");
    write(repo, FACTS, JSON.stringify(FACTS_FILE));
    write(repo, SPEC, PRICE_SPEC(10));
    write(repo, PAGE, PAGE_OBJECT('locator("#total")'));
    write(repo, HELPER, HELPER_FILE(10));
    write(repo, KNOWN_ISSUES, "{}\n");
    write(repo, "playwright.config.ts", "export default {};\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "base");
    baseline = snapshot();
  });

  test.afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  test("a renamed selector fixed in a page object is clean", () => {
    write(repo, PAGE, PAGE_OBJECT('getByTestId("total")'));

    const result = runGuard(repo, `--base=${baseline}`);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ok");
  });

  test("a new page object and a new dataset file are clean", () => {
    write(repo, "pages/new-page.ts", "export const a = 1;\n");
    write(repo, "dataset/builders/new.ts", "export const b = 2;\n");

    expect(runGuard(repo, `--base=${baseline}`).status).toBe(0);
  });

  test("a changed expected price in a spec exits 1 and says it is outside the healer paths", () => {
    write(repo, SPEC, PRICE_SPEC(12));

    const result = runGuard(repo, `--base=${baseline}`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`outside healer paths: ${SPEC}`);
  });

  const SLIP_THROUGHS: Record<string, string> = {
    "an added test.skip": 'test.skip(true, "later");\n',
    "an added test.fixme": 'test.fixme(true, "later");\n',
    "an added test.fail": "test.fail();\n",
    "an added return": "return;\n",
    "a changed timeout": "test.setTimeout(999999);\n",
    "an added describe.skip": 'test.describe.skip("x", () => {});\n',
  };

  for (const [name, line] of Object.entries(SLIP_THROUGHS)) {
    test(`${name} in a spec is a finding`, () => {
      write(repo, SPEC, `${PRICE_SPEC(10)}${line}`);

      const result = runGuard(repo, `--base=${baseline}`);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain(`outside healer paths: ${SPEC}`);
    });
  }

  test("a known-issues.json entry is a finding", () => {
    write(repo, KNOWN_ISSUES, '{ "x": { "summary": "s" } }\n');

    const result = runGuard(repo, `--base=${baseline}`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`outside healer paths: ${KNOWN_ISSUES}`);
  });

  test("a spec renamed away from .spec.ts is a finding", () => {
    renameSync(join(repo, SPEC), join(repo, "pages", "cart-checks.ts"));

    const result = runGuard(repo, `--base=${baseline}`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`outside healer paths: ${SPEC}`);
  });

  test("a changed toHaveText in a page object is a finding", () => {
    write(repo, PAGE, PAGE_OBJECT('locator("#total")').replace('"10"', '"12"'));

    const result = runGuard(repo, `--base=${baseline}`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${PAGE}: await expect(total).toHaveText("10");`);
  });

  test("a changed helper expectTotal in the dataset is a finding", () => {
    write(repo, HELPER, HELPER_FILE(12));

    const result = runGuard(repo, `--base=${baseline}`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${HELPER}: expectTotal(cart, 10);`);
  });

  test("a value deep inside a long expectation body is found", () => {
    const body = Array.from({ length: 60 }, (_, index) => `  field${index}: ${index},`);
    const content = (last: number): string =>
      `export const x = expect(order).toEqual({\n${body.join("\n")}\n  last: ${last},\n});\n`;
    write(repo, "dataset/long.ts", content(1));
    const longBase = snapshot();
    write(repo, "dataset/long.ts", content(2));

    const result = runGuard(repo, `--base=${longBase}`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("dataset/long.ts:");
  });

  test("an untracked spec edited after the baseline is a finding", () => {
    write(repo, "tests/e2e/draft.spec.ts", PRICE_SPEC(10));
    const withDraft = snapshot();
    write(repo, "tests/e2e/draft.spec.ts", PRICE_SPEC(12));

    const result = runGuard(repo, `--base=${withDraft}`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("outside healer paths: tests/e2e/draft.spec.ts");
  });

  test("an untracked page object edited after the baseline is clean", () => {
    write(repo, "pages/draft-page.ts", "export const a = page.locator('#a');\n");
    const withDraft = snapshot();
    write(repo, "pages/draft-page.ts", "export const a = page.getByTestId('a');\n");

    expect(runGuard(repo, `--base=${withDraft}`).status).toBe(0);
  });

  test("an untracked spec that was already there and did not change is clean", () => {
    write(repo, "tests/e2e/draft.spec.ts", PRICE_SPEC(10));
    const withDraft = snapshot();

    expect(runGuard(repo, `--base=${withDraft}`).status).toBe(0);
  });

  test("without --base it compares against HEAD, and a commit is accepted as a base", () => {
    write(repo, SPEC, PRICE_SPEC(12));
    expect(runGuard(repo).status).toBe(1);

    git(repo, "commit", "-q", "-a", "-m", "moved");

    expect(runGuard(repo).status).toBe(0);
    expect(runGuard(repo, `--base=${git(repo, "rev-parse", "HEAD~1").trim()}`).status).toBe(1);
  });

  test("a change committed after the baseline is judged against the baseline", () => {
    write(repo, SPEC, PRICE_SPEC(12));
    git(repo, "commit", "-q", "-a", "-m", "healer commit");

    expect(runGuard(repo, `--base=${baseline}`).status).toBe(1);
  });

  test("a base that is not a tree stops with exit 2, not a clean result", () => {
    const result = runGuard(repo, "--base=does-not-exist");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("does-not-exist");
  });

  test("a base that looks like an option, an unknown argument and a snapshot with a base are refused", () => {
    expect(runGuard(repo, "--base=--output=leak.txt").status).toBe(2);
    expect(runGuard(repo, "--fix").status).toBe(2);
    expect(runGuard(repo, "--snapshot", `--base=${baseline}`).status).toBe(2);
  });

  test("facts that are missing or without healerPaths in the baseline stop it with exit 2", () => {
    const { healerPaths: _ignored, ...withoutPaths } = FACTS_FILE;
    write(repo, FACTS, JSON.stringify(withoutPaths));
    const missingPaths = runGuard(repo, `--base=${snapshot()}`);
    rmSync(join(repo, FACTS));
    const missingFile = runGuard(repo, `--base=${snapshot()}`);

    expect(missingPaths.status).toBe(2);
    expect(missingPaths.stderr).toContain("project.json: healerPaths is missing");
    expect(missingFile.status).toBe(2);
    expect(missingFile.stderr).toContain("project.json: .qa/project.json cannot be read");
  });

  test("an edited facts file in the working tree cannot widen the healer paths", () => {
    write(repo, FACTS, JSON.stringify({ ...FACTS_FILE, healerPaths: ["pages/", "dataset/", "tests/", ".qa/"] }));
    write(repo, SPEC, PRICE_SPEC(12));

    const result = runGuard(repo, `--base=${baseline}`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`outside healer paths: ${SPEC}`);
    expect(result.stdout).toContain(`outside healer paths: ${FACTS}`);
  });

  test("an added test.skip in a page object is a finding", () => {
    write(
      repo,
      PAGE,
      `${PAGE_OBJECT('locator("#total")')}test.skip(true, "later");
`,
    );

    const result = runGuard(repo, `--base=${baseline}`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${PAGE}: added test.skip(true, "later");`);
  });

  test("a guard edited after the baseline cannot hide a change when it is run from the baseline", () => {
    for (const name of readdirSync(resolve("qa")).filter((file) => file.endsWith(".mts"))) {
      write(repo, `qa/${name}`, readFileSync(resolve("qa", name), "utf8"));
    }
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "guard");
    const tree = snapshot();
    const edited = join(repo, "qa", "expectation-guard.mts");
    writeFileSync(edited, 'process.stdout.write("expectation-guard: ok");');
    write(repo, SPEC, PRICE_SPEC(12));

    const fromWorkingTree = spawnSync("node", [edited, `--base=${tree}`], { cwd: repo, encoding: "utf8" });
    const fromBaseline = runFromBaseline(repo, tree);

    expect(fromWorkingTree.status).toBe(0);
    expect(fromBaseline.status).toBe(1);
    expect(fromBaseline.stdout).toContain(`outside healer paths: ${SPEC}`);
  });

  test("snapshot and guard leave the index, the working tree and the git status as they were", () => {
    write(repo, SPEC, PRICE_SPEC(12));
    write(repo, "pages/untracked.ts", "export const a = 1;\n");
    const status = git(repo, "status", "--porcelain");
    const index = readFileSync(join(repo, ".git", "index"));

    runGuard(repo, "--snapshot");
    runGuard(repo, `--base=${baseline}`);

    expect(git(repo, "status", "--porcelain")).toBe(status);
    expect(readFileSync(join(repo, ".git", "index")).equals(index)).toBe(true);
  });
});

test.describe("expectation guard against a planted git configuration", () => {
  let root = "";
  let repo = "";
  let baseline = "";

  function markerCommand(name: string): string {
    return `node -e "require('fs').writeFileSync('${join(root, name).replaceAll("\\", "/")}','x')"`;
  }

  test.beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
    repo = join(root, "repo");
    mkdirSync(repo);
    git(repo, "init", "-q");
    write(repo, FACTS, JSON.stringify(FACTS_FILE));
    write(repo, SPEC, PRICE_SPEC(10));
    write(repo, PAGE, PAGE_OBJECT('locator("#total")'));
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "base");
    const result = runGuard(repo, "--snapshot");
    expect(result.status).toBe(0);
    baseline = result.stdout.trim();
  });

  test.afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("a core.fsmonitor in .git/config does not run during the guard", () => {
    git(repo, "config", "core.fsmonitor", markerCommand("fsmonitor-ran"));
    write(repo, PAGE, PAGE_OBJECT('getByTestId("total")'));

    expect(runGuard(repo, "--snapshot").status).toBe(0);
    expect(runGuard(repo, `--base=${baseline}`).status).toBe(0);
    expect(runGuard(repo, "--repo-fingerprint").status).toBe(0);
    expect(readdirSync(root)).not.toContain("fsmonitor-ran");
  });

  test("a filter planted in .git/config and .git/info/attributes neither runs nor hides a changed spec", () => {
    git(repo, "config", "filter.planted.clean", markerCommand("filter-ran"));
    git(repo, "config", "filter.planted.required", "true");
    write(repo, ".git/info/attributes", "* filter=planted\n");
    write(repo, SPEC, PRICE_SPEC(12));

    const result = runGuard(repo, `--base=${baseline}`);

    expect(readdirSync(root)).not.toContain("filter-ran");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`outside healer paths: ${SPEC}`);
  });

  test("a -diff attribute in .git/info/attributes does not hide a changed expectation in a page object", () => {
    write(repo, ".git/info/attributes", "*.ts -diff\n");
    write(repo, PAGE, PAGE_OBJECT('locator("#total")').replace('toHaveText("10")', 'toHaveText("12")'));

    const result = runGuard(repo, `--base=${baseline}`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${PAGE}: await expect(total).toHaveText("10");`);
  });

  test("a hook in .git/hooks does not run during the guard", () => {
    write(repo, ".git/hooks/post-index-change", `#!/bin/sh\n${markerCommand("hook-ran")}\n`);
    write(repo, PAGE, PAGE_OBJECT('getByTestId("total")'));

    expect(runGuard(repo, "--snapshot").status).toBe(0);
    expect(runGuard(repo, `--base=${baseline}`).status).toBe(0);
    expect(readdirSync(root)).not.toContain("hook-ran");
  });

  test("a hook defined in .git/config does not run during the guard", () => {
    git(repo, "config", "hook.planted.event", "post-index-change");
    git(repo, "config", "hook.planted.command", markerCommand("config-hook-ran"));
    git(repo, "config", "hook.planted.with.dots.event", "post-index-change");
    git(repo, "config", "hook.planted.with.dots.command", markerCommand("dotted-hook-ran"));
    write(repo, PAGE, PAGE_OBJECT('getByTestId("total")'));

    expect(runGuard(repo, "--snapshot").status).toBe(0);
    expect(runGuard(repo, `--base=${baseline}`).status).toBe(0);
    expect(readdirSync(root)).not.toContain("config-hook-ran");
    expect(readdirSync(root)).not.toContain("dotted-hook-ran");
  });
});

test.describe("repository fingerprint", () => {
  let repo = "";

  function fingerprint(): string {
    const result = runGuard(repo, "--repo-fingerprint");
    expect(result.status).toBe(0);
    return result.stdout;
  }

  test.beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
    git(repo, "init", "-q");
    write(repo, FACTS, JSON.stringify(FACTS_FILE));
    write(repo, PAGE, PAGE_OBJECT('locator("#total")'));
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "base");
  });

  test.afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  test("prints one sha and the same one twice", () => {
    const first = fingerprint();

    expect(first).toMatch(/^[0-9a-f]{64}\n$/);
    expect(fingerprint()).toBe(first);
  });

  test("changes when a pre-commit hook is added", () => {
    const before = fingerprint();
    write(repo, ".git/hooks/pre-commit", "#!/bin/sh\nexit 0\n");

    expect(fingerprint()).not.toBe(before);
  });

  test("changes when a hook is added to the folder core.hooksPath names, inside the working tree", () => {
    git(repo, "config", "core.hooksPath", "pages/hooks");
    const before = fingerprint();
    write(repo, "pages/hooks/pre-commit", "#!/bin/sh\nexit 0\n");
    const added = fingerprint();
    write(repo, "pages/hooks/pre-commit", "#!/bin/sh\nexit 1\n");

    expect(added).not.toBe(before);
    expect(fingerprint()).not.toBe(added);
  });

  test("changes when .git/config, .git/info/ or .qa/project.json change", () => {
    const before = fingerprint();
    git(repo, "config", "core.fsmonitor", "x");
    const afterConfig = fingerprint();
    write(repo, ".git/info/attributes", "* filter=x\n");
    const afterInfo = fingerprint();
    write(repo, FACTS, JSON.stringify({ ...FACTS_FILE, healerPaths: ["pages/", "tests/"] }));

    expect(afterConfig).not.toBe(before);
    expect(afterInfo).not.toBe(afterConfig);
    expect(fingerprint()).not.toBe(afterInfo);
  });

  test("does not change when a page object or a spec changes, and leaves the index and status as they were", () => {
    const before = fingerprint();
    write(repo, PAGE, PAGE_OBJECT('getByTestId("total")'));
    write(repo, SPEC, PRICE_SPEC(12));
    const status = git(repo, "status", "--porcelain");
    const index = readFileSync(join(repo, ".git", "index"));

    expect(fingerprint()).toBe(before);
    expect(git(repo, "status", "--porcelain")).toBe(status);
    expect(readFileSync(join(repo, ".git", "index")).equals(index)).toBe(true);
  });

  test("takes no other argument", () => {
    expect(runGuard(repo, "--repo-fingerprint", "--snapshot").status).toBe(2);
    expect(runGuard(repo, "--repo-fingerprint", `--base=${"a".repeat(40)}`).status).toBe(2);
  });
});

test.describe("heal recipe of /qa and /qa-heal", () => {
  const QA_MODULES = ["qa/expectation-guard.mts", "qa/project-facts.mts"];
  let root = "";
  let repo = "";
  let baseline = "";
  let fingerprint = "";

  function recipeOf(command: string): string[] {
    const text = readFileSync(join(".claude", "commands", command), "utf8");
    const start = text.indexOf("```shell", text.indexOf("--repo-fingerprint"));
    const end = text.indexOf("```", start + 1);
    return text
      .slice(start, end)
      .split("\n")
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line !== "");
  }

  function runRecipe(env: NodeJS.ProcessEnv = {}): { status: number | null; stdout: string } {
    const script = recipeOf("qa-heal.md")
      .join("\n")
      .replaceAll("<baseline tree id>", baseline)
      .replaceAll("<fingerprint>", fingerprint);
    const result = spawnSync("bash", ["-c", script], { cwd: repo, encoding: "utf8", env: { ...process.env, ...env } });
    return { status: result.status, stdout: result.stdout };
  }

  function plantSmudge(): string {
    const forged = `process.stdout.write(process.argv.includes("--repo-fingerprint") ? "${fingerprint}\n" : "expectation-guard: ok\n");\n`;
    const smudge = join(root, "smudge.cjs");
    writeFileSync(
      smudge,
      `require("fs").writeFileSync(${JSON.stringify(join(root, "smudge-ran"))}, "x");\nprocess.stdin.resume();\nprocess.stdin.on("end", () => process.stdout.write(${JSON.stringify(forged)}));\n`,
    );
    return `node ${smudge.replaceAll("\\", "/")}`;
  }

  test.beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
    repo = join(root, "repo");
    mkdirSync(repo);
    git(repo, "init", "-q");
    for (const file of QA_MODULES) {
      write(repo, file, readFileSync(file, "utf8"));
    }
    write(repo, FACTS, JSON.stringify(FACTS_FILE));
    write(repo, SPEC, PRICE_SPEC(10));
    write(repo, PAGE, PAGE_OBJECT('locator("#total")'));
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "base");
    baseline = runGuard(repo, "--snapshot").stdout.trim();
    fingerprint = runGuard(repo, "--repo-fingerprint").stdout.trim();
  });

  test.afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("/qa and /qa-heal carry the same recipe, which reads the baseline with git cat-file and never git archive", () => {
    const recipe = recipeOf("qa-heal.md");

    expect(recipeOf("qa.md")).toEqual(recipe);
    expect(recipe.join("\n")).not.toContain("archive");
    expect(recipe.join("\n")).toContain("cat-file blob");
  });

  test("an untouched repository with a changed page object is clean", () => {
    write(repo, PAGE, PAGE_OBJECT('getByTestId("total")'));

    expect(runRecipe().status).toBe(0);
  });

  test("a guard forged in the working tree is not the one that judges", () => {
    write(repo, "qa/expectation-guard.mts", 'process.stdout.write("expectation-guard: ok\n");\n');
    write(repo, SPEC, PRICE_SPEC(12));

    const result = runRecipe();

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain(`outside healer paths: ${SPEC}`);
  });

  test("a smudge filter planted in .git/config and .git/info/attributes does not run and cannot forge the guard", () => {
    git(repo, "config", "filter.ev.smudge", plantSmudge());
    write(repo, ".git/info/attributes", "* filter=ev\n");
    write(repo, SPEC, PRICE_SPEC(12));

    const result = runRecipe();

    expect(readdirSync(root)).not.toContain("smudge-ran");
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("repository config changed by the healer");
  });

  test("a smudge filter from the global config and attributes file does not run and cannot forge the guard", () => {
    const attributes = join(root, "attributes");
    const global = join(root, "global.gitconfig");
    writeFileSync(attributes, "* filter=ev\n");
    writeFileSync(
      global,
      `[core]\n\tattributesFile = ${attributes.replaceAll("\\", "/")}\n[filter "ev"]\n\tsmudge = ${plantSmudge()}\n`,
    );
    write(repo, SPEC, PRICE_SPEC(12));

    const result = runRecipe({ GIT_CONFIG_GLOBAL: global });

    expect(readdirSync(root)).not.toContain("smudge-ran");
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain(`outside healer paths: ${SPEC}`);
  });
});
