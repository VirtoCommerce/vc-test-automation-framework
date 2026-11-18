import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { findChangedExpectations } from "../../../qa/expectation-guard.mts";

const GUARD = resolve("qa/expectation-guard.mts");
const SPEC = "tests/e2e/cart.spec.ts";
const PAGE = "pages/cart-page.ts";
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
const PRICE_SPEC = (value: number): string =>
  `test("price", async () => {\n  const price = await cart.price();\n  expect(price).toBe(${value});\n});\n`;

function diffOf(file: string, hunk: string): string {
  return `diff --git a/${file} b/${file}\nindex 1111111..2222222 100644\n--- a/${file}\n+++ b/${file}\n${hunk}\n`;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", [...GIT_IDENTITY, ...args], { cwd, encoding: "utf8" });
}

function write(cwd: string, file: string, text: string): void {
  mkdirSync(dirname(join(cwd, file)), { recursive: true });
  writeFileSync(join(cwd, file), text);
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

  test("a changed expected value of a table row is found", () => {
    const diff = diffOf(
      SPEC,
      [
        "@@ -1,2 +1,2 @@",
        "-  { quantity: 2, expectedTotal: 20 },",
        "+  { quantity: 2, expectedTotal: 22 },",
        " ];",
      ].join("\n"),
    );

    expect(findChangedExpectations(diff)).toHaveLength(1);
  });

  test("a removed line starting with dashes is read as content, not as a file header", () => {
    const diff = diffOf(SPEC, ["@@ -1,3 +1,2 @@", " a", "--- expect(x).toBe(1);", " b"].join("\n"));

    expect(findChangedExpectations(diff)).toEqual([{ file: SPEC, line: "-- expect(x).toBe(1);" }]);
  });

  test("findings carry the file of their own section", () => {
    const diff = `${diffOf(PAGE, "@@ -1,1 +1,1 @@\n-  expect(a).toBe(1);\n+  expect(a).toBe(2);")}${diffOf(
      "tests/api/orders.spec.ts",
      "@@ -1,1 +1,1 @@\n-  expect(b).toBe(1);\n+  expect(b).toBe(2);",
    )}`;

    expect(findChangedExpectations(diff)).toEqual([{ file: "tests/api/orders.spec.ts", line: "  expect(b).toBe(1);" }]);
  });

  test("a deleted spec file is found, a renamed page object is not", () => {
    const deleted = `diff --git a/${SPEC} b/${SPEC}\ndeleted file mode 100644\nindex 1111111..0000000\n--- a/${SPEC}\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-test(() => {\n-  expect(a).toBe(1);\n`;
    const renamed = `diff --git a/pages/a.ts b/pages/b.ts\nsimilarity index 90%\nrename from pages/a.ts\nrename to pages/b.ts\nindex 1111111..2222222 100644\n--- a/pages/a.ts\n+++ b/pages/b.ts\n@@ -1,1 +1,1 @@\n-  expect(a).toBe(1);\n+  expect(a).toBe(2);\n`;

    expect(findChangedExpectations(deleted)).toEqual([{ file: SPEC, line: "  expect(a).toBe(1);" }]);
    expect(findChangedExpectations(renamed)).toEqual([]);
  });

  test("an empty diff has no findings", () => {
    expect(findChangedExpectations("")).toEqual([]);
  });
});

test.describe("expectation guard CLI", () => {
  let repo = "";
  let baseline = "";

  test.beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
    git(repo, "init", "-q");
    write(repo, SPEC, PRICE_SPEC(10));
    write(repo, PAGE, 'export const total = page.locator("#total");\n');
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "base");
    baseline = git(repo, "rev-parse", "HEAD").trim();
  });

  test.afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  test("a renamed selector fixed in a page object is clean", () => {
    write(repo, PAGE, 'export const total = page.getByTestId("total");\n');

    const result = runGuard(repo, `--base=${baseline}`);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ok");
  });

  test("a changed expected price in a spec exits 1 and names the line", () => {
    write(repo, SPEC, PRICE_SPEC(12));

    const result = runGuard(repo, `--base=${baseline}`);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(SPEC);
    expect(result.stdout).toContain("expect(price).toBe(10);");
  });

  test("without --base it compares against HEAD", () => {
    write(repo, SPEC, 'test("price", async () => {\n  const price = await cart.price();\n});\n');
    expect(runGuard(repo).status).toBe(1);

    git(repo, "commit", "-q", "-a", "-m", "moved");

    expect(runGuard(repo).status).toBe(0);
    expect(runGuard(repo, `--base=${baseline}`).status).toBe(1);
  });

  test("a change committed after the baseline is judged against the baseline", () => {
    write(repo, SPEC, PRICE_SPEC(12));
    git(repo, "commit", "-q", "-a", "-m", "healer commit");

    expect(runGuard(repo, `--base=${baseline}`).status).toBe(1);
  });

  test("an untracked new spec is not a finding", () => {
    write(repo, "tests/e2e/new.spec.ts", 'test("n", () => {\n  expect(1).toBe(1);\n});\n');

    expect(runGuard(repo, `--base=${baseline}`).status).toBe(0);
  });

  test("a base that is not a commit stops with exit 2, not a clean result", () => {
    const result = runGuard(repo, "--base=does-not-exist");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("does-not-exist");
  });

  test("a base that looks like an option is refused", () => {
    expect(runGuard(repo, "--base=--output=leak.txt").status).toBe(2);
  });

  test("an unknown argument is refused", () => {
    expect(runGuard(repo, "--fix").status).toBe(2);
  });

  test("it only reads: the index and the working tree stay as they were", () => {
    write(repo, SPEC, PRICE_SPEC(12));
    const status = git(repo, "status", "--porcelain");
    const index = readFileSync(join(repo, ".git", "index"));

    runGuard(repo, `--base=${baseline}`);

    expect(git(repo, "status", "--porcelain")).toBe(status);
    expect(readFileSync(join(repo, ".git", "index")).equals(index)).toBe(true);
  });
});
