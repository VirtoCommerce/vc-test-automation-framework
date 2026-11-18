import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { proveFails, removeWorktree } from "../../../qa/prove-fails.mts";

const SPEC = "tests/unit/qa/fixtures/prove-fails-target.test.ts";
const TITLE = "adds two numbers";
const JUDGE_DIR = ".qa/judge";
const SCRATCH = join(JUDGE_DIR, `prove-fails-test-${process.pid}`);
const GENERATED_DIR = "tests/unit/qa/fixtures/generated";
const TEMP_PREFIX = "prove-fails-";
const PROVE_TIMEOUT_MS = 240_000;
const HEADER = 'import { expect, test } from "@playwright/test";\n\n';
const INJECTED = '    expect(total).toBe(4); process.getBuiltinModule("node:fs").writeFileSync("x", "");';
const REPLACE_ONLY = "may only replace one string or number literal with another";

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

function generatedSpec(name: string, body: string): string {
  mkdirSync(GENERATED_DIR, { recursive: true });
  const file = `${GENERATED_DIR}/${name}-${process.pid}.test.ts`;
  writeFileSync(file, `${HEADER}${body}`);
  return file;
}

function breakExpectedValue(): string {
  return writePatch("break.patch", patchLine(SPEC, 6, "    expect(total).toBe(4);", "    expect(total).toBe(5);"));
}

function status(): string {
  return execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
}

function leftovers(): string[] {
  return readdirSync(tmpdir()).filter((name) => name.startsWith(TEMP_PREFIX));
}

function worktrees(): string[] {
  return execFileSync("git", ["worktree", "list", "--porcelain"], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line.startsWith("worktree "));
}

test.beforeAll(() => {
  rmSync(GENERATED_DIR, { recursive: true, force: true });
});

test.afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
  rmSync(GENERATED_DIR, { recursive: true, force: true });
});

test.describe("prove-fails (unit)", () => {
  test("proveFails leaves the working tree unchanged", async () => {
    const before = status();
    const trees = worktrees();
    const temporary = leftovers();
    const result = await proveFails(SPEC, TITLE, breakExpectedValue());
    expect(result.failed).toBe(true);
    expect(status()).toBe(before);
    expect(worktrees()).toEqual(trees);
    expect(leftovers()).toEqual(temporary);
    expect(existsSync(JUDGE_DIR) ? readdirSync(JUDGE_DIR).filter((name) => name.startsWith("prove-")) : []).toEqual([
      `prove-fails-test-${process.pid}`,
    ]);
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

  test("proveFails runs in a worktree outside the repository", async () => {
    process.env["PROVE_REPO_ROOT"] = process.cwd();
    const spec = generatedSpec(
      "outside",
      'test("runs outside the repository", () => {\n  const root = process.env["PROVE_REPO_ROOT"] ?? "";\n  const outside = root !== "" && !process.cwd().startsWith(root) ? 1 : 0;\n  expect(outside).toBe(1);\n});\n',
    );
    try {
      const patch = writePatch(
        "outside.patch",
        patchLine(spec, 6, "  expect(outside).toBe(1);", "  expect(outside).toBe(2);"),
      );
      expect((await proveFails(spec, "runs outside the repository", patch)).failed).toBe(true);
    } finally {
      delete process.env["PROVE_REPO_ROOT"];
    }
  });

  test("proveFails sees a test that exists only in the working tree, even a git-ignored one", async () => {
    const spec = generatedSpec(
      "uncommitted",
      'test("subtracts", () => {\n  const left = 5 - 2;\n  expect(left).toBe(3);\n});\n',
    );
    const patch = writePatch(
      "uncommitted.patch",
      patchLine(spec, 5, "  expect(left).toBe(3);", "  expect(left).toBe(4);"),
    );
    expect((await proveFails(spec, "subtracts", patch)).failed).toBe(true);
  });

  test("proveFails accepts a changed string literal", async () => {
    const spec = generatedSpec(
      "string",
      'test("names it", () => {\n  const name = "abc";\n  expect(name).toBe("abc");\n});\n',
    );
    const patch = writePatch(
      "string.patch",
      patchLine(spec, 5, '  expect(name).toBe("abc");', "  expect(name).toBe('abd');"),
    );
    expect((await proveFails(spec, "names it", patch)).failed).toBe(true);
  });

  test("proveFails reports failed: false for an assertion that cannot fail", async () => {
    const spec = generatedSpec(
      "tautology",
      'test("always equal", () => {\n  const total = 4;\n  expect(total).toBe(total);\n});\n',
    );
    const patch = writePatch("tautology.patch", patchLine(spec, 4, "  const total = 4;", "  const total = 5;"));
    const result = await proveFails(spec, "always equal", patch);
    expect(result).toEqual({ failed: false, output: "the test passed" });
  });

  test("proveFails does not take a flaky result for a proof", async () => {
    const spec = generatedSpec(
      "flaky",
      'test.describe.configure({ retries: 2 });\n\ntest("flaky one", (_fixtures, testInfo) => {\n  const limit = 0;\n  expect(testInfo.retry).toBeGreaterThanOrEqual(limit);\n});\n',
    );
    const patch = writePatch("flaky.patch", patchLine(spec, 6, "  const limit = 0;", "  const limit = 1;"));
    await expect(proveFails(spec, "flaky one", patch)).rejects.toThrow("flaky");
  });

  test("proveFails removes its worktree and leaves the working tree alone when the patch does not apply", async () => {
    const before = status();
    const temporary = leftovers();
    const bad = writePatch("bad.patch", patchLine(SPEC, 6, "    expect(total).toBe(9);", "    expect(total).toBe(5);"));
    await expect(proveFails(SPEC, TITLE, bad)).rejects.toThrow("prove-fails: the patch does not apply");
    expect(status()).toBe(before);
    expect(leftovers()).toEqual(temporary);
  });

  test("proveFails refuses a test that fails before the patch", async () => {
    const spec = generatedSpec("red", 'test("already red", () => {\n  expect(1).toBe(2);\n});\n');
    const patch = writePatch("red.patch", patchLine(spec, 4, "  expect(1).toBe(2);", "  expect(1).toBe(3);"));
    await expect(proveFails(spec, "already red", patch)).rejects.toThrow("fails before the patch");
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

  test("proveFails refuses a patch that touches any file but the spec", async () => {
    for (const file of ["core/env.ts", "package.json", "playwright.config.ts", ".env.local", "qa/contract.mts"]) {
      const patch = writePatch("touch.patch", patchLine(file, 1, "a", "b"));
      await expect(proveFails(SPEC, TITLE, patch)).rejects.toThrow(`may touch only ${SPEC}`);
    }
    const both = writePatch(
      "both.patch",
      patchLine(SPEC, 6, "    expect(total).toBe(4);", "    expect(total).toBe(5);") +
        patchLine("core/env.ts", 1, "a", "b"),
    );
    await expect(proveFails(SPEC, TITLE, both)).rejects.toThrow("prove-fails: the patch");
    const created = writePatch("created.patch", `--- /dev/null\n+++ b/${SPEC}\n@@ -0,0 +1,1 @@\n+x\n`);
    await expect(proveFails(SPEC, TITLE, created)).rejects.toThrow(`may touch only ${SPEC}`);
  });

  test("proveFails refuses code injected into the spec", async () => {
    const injected = writePatch("injected.patch", patchLine(SPEC, 6, "    expect(total).toBe(4);", INJECTED));
    await expect(proveFails(SPEC, TITLE, injected)).rejects.toThrow(REPLACE_ONLY);
    const interpolated = writePatch(
      "interpolated.patch",
      patchLine(SPEC, 5, "    const total = `4`;", `    const total = \`$\{process.exit(1)}\`;`),
    );
    await expect(proveFails(SPEC, TITLE, interpolated)).rejects.toThrow(REPLACE_ONLY);
    const imported = writePatch(
      "imported.patch",
      patchLine(
        SPEC,
        1,
        'import { expect, test } from "@playwright/test";',
        'import { expect, test } from "/elsewhere/evil.mts";',
      ),
    );
    await expect(proveFails(SPEC, TITLE, imported)).rejects.toThrow(REPLACE_ONLY);
  });

  test("proveFails refuses a hunk that adds or removes lines", async () => {
    const header = [`--- a/${SPEC}`, `+++ b/${SPEC}`];
    const hunks: Record<string, string[]> = {
      adds: [
        "@@ -6,1 +6,2 @@",
        "-    expect(total).toBe(4);",
        "+    expect(total).toBe(5);",
        "+    expect(total).toBe(6);",
      ],
      removes: [
        "@@ -5,2 +5,1 @@",
        "-    const total = 2 + 2;",
        "-    expect(total).toBe(4);",
        "+    expect(total).toBe(5);",
      ],
      "only removes": ["@@ -6,1 +5,0 @@", "-    expect(total).toBe(4);"],
      "only adds": ["@@ -6,0 +7,1 @@", "+    process.exit(1);"],
    };
    for (const [name, lines] of Object.entries(hunks)) {
      const patch = writePatch(`${name.replace(" ", "-")}.patch`, [...header, ...lines, ""].join("\n"));
      await expect(proveFails(SPEC, TITLE, patch)).rejects.toThrow(REPLACE_ONLY);
    }
  });

  test("proveFails refuses a patch with lines outside a hunk", async () => {
    const stray = writePatch(
      "stray.patch",
      `${patchLine(SPEC, 6, "    expect(total).toBe(4);", "    expect(total).toBe(5);")}process.exit(1);\n`,
    );
    await expect(proveFails(SPEC, TITLE, stray)).rejects.toThrow("prove-fails: the patch");
  });

  test("proveFails cleans up without a throw and keeps what a link points at", async () => {
    const target = mkdtempSync(join(tmpdir(), "prove-fails-target-"));
    const worktree = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
    try {
      writeFileSync(join(target, "kept.txt"), "kept");
      symlinkSync(target, join(worktree, "node_modules"), "junction");
      await removeWorktree(process.cwd(), worktree);
      expect(existsSync(worktree)).toBe(false);
      expect(readFileSync(join(target, "kept.txt"), "utf8")).toBe("kept");
      await removeWorktree(process.cwd(), join(tmpdir(), `${TEMP_PREFIX}absent-${process.pid}`));
    } finally {
      rmSync(target, { recursive: true, force: true });
      rmSync(worktree, { recursive: true, force: true });
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
