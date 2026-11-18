import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { proveFails } from "../../../qa/prove-fails.mts";

const SPEC = "tests/unit/qa/fixtures/prove-fails-target.test.ts";
const TITLE = "adds two numbers";
const JUDGE_DIR = ".qa/judge";
const SCRATCH = join(JUDGE_DIR, `prove-fails-test-${process.pid}`);
const PROVE_TIMEOUT_MS = 240_000;

test.describe.configure({ mode: "serial", timeout: PROVE_TIMEOUT_MS });

function patchLine(file: string, line: number, from: string, to: string): string {
  return [`--- a/${file}`, `+++ b/${file}`, `@@ -${line},1 +${line},1 @@`, `-${from}`, `+${to}`, ""].join("\n");
}

function writePatch(name: string, text: string): string {
  mkdirSync(SCRATCH, { recursive: true });
  const file = join(SCRATCH, name);
  writeFileSync(file, text);
  return file;
}

function breakExpectedValue(): string {
  return writePatch("break.patch", patchLine(SPEC, 6, "    expect(total).toBe(4);", "    expect(total).toBe(5);"));
}

function status(): string {
  return execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
}

function leftovers(): string[] {
  return readdirSync(JUDGE_DIR).filter((name) => name.startsWith("prove-") && !name.startsWith("prove-fails-test-"));
}

function worktrees(): string[] {
  return execFileSync("git", ["worktree", "list", "--porcelain"], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line.startsWith("worktree "));
}

test.afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

test.describe("prove-fails (unit)", () => {
  test("proveFails leaves the working tree unchanged", async () => {
    const before = status();
    const trees = worktrees();
    const result = await proveFails(SPEC, TITLE, breakExpectedValue());
    expect(result.failed).toBe(true);
    expect(status()).toBe(before);
    expect(worktrees()).toEqual(trees);
    expect(leftovers()).toEqual([]);
    expect(existsSync("node_modules/@playwright/test")).toBe(true);
  });

  test("proveFails reports failed: true for a patch that breaks the expected value", async () => {
    const result = await proveFails(SPEC, TITLE, breakExpectedValue(), "unit");
    expect(result.failed).toBe(true);
    expect(result.output).toContain("toBe");
    expect(result.output).toContain("5");
  });

  test("proveFails reports failed: false for a patch that keeps the behaviour", async () => {
    const harmless = writePatch(
      "harmless.patch",
      patchLine(SPEC, 5, "    const total = 2 + 2;", "    const total = 1 + 3;"),
    );
    const result = await proveFails(SPEC, TITLE, harmless);
    expect(result.failed).toBe(false);
  });

  test("proveFails sees a test that exists only in the working tree", async () => {
    const spec = `tests/unit/qa/fixtures/prove-fails-uncommitted-${process.pid}.test.ts`;
    writeFileSync(
      spec,
      'import { expect, test } from "@playwright/test";\n\ntest("subtracts", () => {\n  const left = 5 - 2;\n  expect(left).toBe(3);\n});\n',
    );
    try {
      const patch = writePatch(
        "uncommitted.patch",
        patchLine(spec, 5, "  expect(left).toBe(3);", "  expect(left).toBe(4);"),
      );
      expect((await proveFails(spec, "subtracts", patch)).failed).toBe(true);
    } finally {
      rmSync(spec, { force: true });
    }
  });

  test("proveFails reports failed: false for an assertion that cannot fail", async () => {
    const spec = `tests/unit/qa/fixtures/prove-fails-tautology-${process.pid}.test.ts`;
    writeFileSync(
      spec,
      'import { expect, test } from "@playwright/test";\n\ntest("always equal", () => {\n  const total = 4;\n  expect(total).toBe(total);\n});\n',
    );
    try {
      const patch = writePatch("tautology.patch", patchLine(spec, 4, "  const total = 4;", "  const total = 5;"));
      const result = await proveFails(spec, "always equal", patch);
      expect(result).toEqual({ failed: false, output: "the test passed" });
    } finally {
      rmSync(spec, { force: true });
    }
  });

  test("proveFails removes its worktree and leaves the working tree alone when the patch does not apply", async () => {
    const before = status();
    const bad = writePatch("bad.patch", patchLine(SPEC, 6, "    expect(total).toBe(9);", "    expect(total).toBe(5);"));
    await expect(proveFails(SPEC, TITLE, bad)).rejects.toThrow("prove-fails: the patch does not apply");
    expect(status()).toBe(before);
    expect(leftovers()).toEqual([]);
  });

  test("proveFails refuses a test that fails before the patch", async () => {
    const spec = `tests/unit/qa/fixtures/prove-fails-red-${process.pid}.test.ts`;
    writeFileSync(
      spec,
      'import { expect, test } from "@playwright/test";\n\ntest("already red", () => {\n  expect(1).toBe(2);\n});\n',
    );
    try {
      const patch = writePatch("red.patch", patchLine(spec, 4, "  expect(1).toBe(2);", "  expect(1).toBe(3);"));
      await expect(proveFails(spec, "already red", patch)).rejects.toThrow("fails before the patch");
    } finally {
      rmSync(spec, { force: true });
    }
  });

  test("proveFails names what is wrong with its inputs", async () => {
    const patch = breakExpectedValue();
    await expect(proveFails(SPEC, "no such title", patch)).rejects.toThrow("no test titled");
    await expect(proveFails("tests/unit/qa/fixtures/absent.test.ts", TITLE, patch)).rejects.toThrow("is not a file");
    await expect(proveFails("../outside.test.ts", TITLE, patch)).rejects.toThrow("inside the repository");
    await expect(proveFails(SPEC, TITLE, "package.json")).rejects.toThrow(`inside ${JUDGE_DIR}`);
    await expect(proveFails(SPEC, TITLE, join(SCRATCH, "missing.patch"))).rejects.toThrow("cannot be read");
    await expect(proveFails(SPEC, TITLE, patch, "no-such-project")).rejects.toThrow("not found");
  });

  test("proveFails refuses a patch that touches configuration, secrets or tooling", async () => {
    for (const file of [
      "package.json",
      "playwright.config.ts",
      ".env.local",
      "qa/contract.mts",
      ".claude/settings.json",
    ]) {
      const patch = writePatch("touch.patch", patchLine(file, 1, "a", "b"));
      await expect(proveFails(SPEC, TITLE, patch)).rejects.toThrow("may not change");
    }
  });

  test("the CLI prints the verdict as JSON and the title may be several words", () => {
    const patch = breakExpectedValue();
    const result = spawnSync("node", ["qa/prove-fails.mts", SPEC, "adds", "two", "numbers", patch, "--project=unit"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ failed: true });
  });

  test("the CLI exits 1 with one line on stderr for a wrong call", () => {
    const result = spawnSync("node", ["qa/prove-fails.mts", SPEC], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("usage");
    const missing = spawnSync("node", ["qa/prove-fails.mts", SPEC, TITLE, join(SCRATCH, "none.patch")], {
      encoding: "utf8",
    });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("cannot be read");
  });
});
