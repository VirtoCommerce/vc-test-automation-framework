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

import { childEnv, mutateAssertion, proveFails, removeWorktree } from "../../../qa/prove-fails.mts";

const SPEC = "tests/unit/qa/fixtures/prove-fails-target.test.ts";
const TITLE = "adds two numbers";
const ASSERTION_LINE = 6;
const GENERATED_DIR = "tests/unit/qa/fixtures/generated";
const TEMP_PREFIX = "prove-fails-";
const PLAYWRIGHT_CLI = "node_modules/@playwright/test/cli.js";
const PROVE_TIMEOUT_MS = 240_000;
const HEADER = 'import { expect, test } from "@playwright/test";\n\n';
const IGNORED_SPEC = `test-results/prove-fails-ignored-${process.pid}.test.ts`;
const NONE = "has no assertion it can change";
const MANY = "has more than one assertion it could change";
const NEGATED = "a .not assertion cannot be proved this way";

test.describe.configure({ mode: "serial", timeout: PROVE_TIMEOUT_MS });

function generatedSpec(name: string, body: string): string {
  mkdirSync(GENERATED_DIR, { recursive: true });
  const file = `${GENERATED_DIR}/${name}-${process.pid}.test.ts`;
  writeFileSync(file, `${HEADER}${body}`);
  return file;
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

function listedFiles(withFixtures: boolean): string[] {
  const reportDir = mkdtempSync(join(tmpdir(), "prove-fails-list-"));
  const report = join(reportDir, "list.json");
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: report };
    if (withFixtures) {
      env["PROVE_FAILS_FIXTURES"] = "1";
    } else {
      delete env["PROVE_FAILS_FIXTURES"];
    }
    spawnSync(
      process.execPath,
      [PLAYWRIGHT_CLI, "test", "--list", "--reporter=json", "--project=unit", "tests/unit/qa/fixtures"],
      { env, encoding: "utf8" },
    );
    const parsed: unknown = JSON.parse(readFileSync(report, "utf8"));
    const suites =
      typeof parsed === "object" && parsed !== null && "suites" in parsed && Array.isArray(parsed.suites)
        ? parsed.suites
        : [];
    return suites.flatMap((suite: unknown) =>
      typeof suite === "object" && suite !== null && "file" in suite ? [String(suite.file)] : [],
    );
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}

test.beforeAll(() => {
  rmSync(GENERATED_DIR, { recursive: true, force: true });
  process.env["PROVE_FAILS_FIXTURES"] = "1";
});

test.afterAll(() => {
  rmSync(GENERATED_DIR, { recursive: true, force: true });
  rmSync(IGNORED_SPEC, { force: true });
  delete process.env["PROVE_FAILS_FIXTURES"];
});

test.describe("the mutation the script makes (unit)", () => {
  test("a number argument of a matcher becomes the number plus one, and nothing else changes", () => {
    const source = readFileSync(SPEC, "utf8");
    const result = mutateAssertion(source, ASSERTION_LINE);
    expect(result.mutated).toBe("    expect(total).toBe(5);");
    expect(result.source).toBe(source.replace("toBe(4)", "toBe(5)"));
  });

  test("a string or plain template argument gets a suffix", () => {
    expect(mutateAssertion('expect(a).toBe("abc");', 1)).toEqual({
      source: 'expect(a).toBe("abc__mutated__");',
      mutated: 'expect(a).toBe("abc__mutated__");',
    });
    expect(mutateAssertion("expect(a).toBe('abc');", 1).mutated).toBe('expect(a).toBe("abc__mutated__");');
    expect(mutateAssertion("expect(a).toEqual(`abc`);", 1).mutated).toBe('expect(a).toEqual("abc__mutated__");');
  });

  test("every matcher form is found, and only the matcher's own arguments change", () => {
    const cases: [string, string][] = [
      ["await expect(a).resolves.toBe(4);", "await expect(a).resolves.toBe(5);"],
      ["expect.soft(a).toBe(4);", "expect.soft(a).toBe(5);"],
      ['await expect.poll(() => a).toBe("x");', 'await expect.poll(() => a).toBe("x__mutated__");'],
      [
        'await expect(page.locator("a")).toHaveText("hi");',
        'await expect(page.locator("a")).toHaveText("hi__mutated__");',
      ],
      ["expect(a).toBe((4));", "expect(a).toBe((5));"],
    ];
    for (const [before, after] of cases) {
      expect(mutateAssertion(before, 1).mutated).toBe(after);
    }
  });

  test("every single-expected-value matcher is mutated, and its argument only", () => {
    const cases: [string, string][] = [
      ["expect(a).toBe(1);", "expect(a).toBe(2);"],
      ["expect(a).toEqual(1);", "expect(a).toEqual(2);"],
      ["expect(a).toStrictEqual(1);", "expect(a).toStrictEqual(2);"],
      ['expect(a).toMatch("x");', 'expect(a).toMatch("x__mutated__");'],
      ['expect(a).toContain("x");', 'expect(a).toContain("x__mutated__");'],
      ["expect(a).toHaveLength(3);", "expect(a).toHaveLength(4);"],
      ["await expect(l).toHaveCount(3);", "await expect(l).toHaveCount(4);"],
      ['await expect(l).toHaveText("x");', 'await expect(l).toHaveText("x__mutated__");'],
      ['await expect(l).toContainText("x");', 'await expect(l).toContainText("x__mutated__");'],
      ['await expect(l).toHaveValue("x");', 'await expect(l).toHaveValue("x__mutated__");'],
      ['await expect(p).toHaveURL("x");', 'await expect(p).toHaveURL("x__mutated__");'],
      ['await expect(p).toHaveTitle("x");', 'await expect(p).toHaveTitle("x__mutated__");'],
      ["expect(a).toBeGreaterThan(1);", "expect(a).toBeGreaterThan(2);"],
      ["expect(a).toBeGreaterThanOrEqual(1);", "expect(a).toBeGreaterThanOrEqual(2);"],
      ["expect(a).toBeLessThan(1);", "expect(a).toBeLessThan(2);"],
      ["expect(a).toBeLessThanOrEqual(1);", "expect(a).toBeLessThanOrEqual(2);"],
    ];
    for (const [before, after] of cases) {
      expect(mutateAssertion(before, 1).mutated, before).toBe(after);
    }
  });

  test("a name, a key, a file or a second argument is never mutated: those lines are refused", () => {
    for (const line of [
      'await expect(l).toHaveAttribute("href", /.*/);',
      'await expect(l).toHaveAttribute("href", "x");',
      'expect(a).toHaveProperty("a", expect.anything());',
      'await expect(l).toHaveCSS("color", "red");',
      'await expect(p).toHaveScreenshot("home.png");',
      "expect(a).toBeCloseTo(0.3, 5);",
      "expect(a).toBe(4, 5);",
      'await expect(l).toHaveText("a", { timeout: 5 });',
      'await expect(a).rejects.toThrow("x");',
      'expect(a).toThrow("x");',
      "expect(a).toBe();",
      "expect(a).toBe(...b);",
    ]) {
      expect(() => mutateAssertion(line, 1), line).toThrow(NONE);
    }
  });

  test("a .not assertion is refused", () => {
    for (const line of [
      "expect(a).not.toBe(4);",
      "await expect(a).resolves.not.toBe(4);",
      'expect(a).not.toMatch("x");',
    ]) {
      expect(() => mutateAssertion(line, 1), line).toThrow(NEGATED);
    }
  });

  test("a line with more than one assertion it could change is refused, with one it is mutated alone", () => {
    for (const line of [
      "expect(a).toBe(1); expect(b).toBe(2);",
      'expect(a).toBe(1); expect(b).toHaveText("x");',
      "expect(a).toBeLessThan(1); expect(b).toBeGreaterThan(0);",
    ]) {
      expect(() => mutateAssertion(line, 1), line).toThrow(MANY);
    }
    expect(mutateAssertion('expect(a).toBe(1); expect(b).toHaveCSS("c", "r");', 1).mutated).toBe(
      'expect(a).toBe(2); expect(b).toHaveCSS("c", "r");',
    );
    expect(mutateAssertion("expect(a).not.toBe(1); expect(b).toBe(2);", 1).mutated).toBe(
      "expect(a).not.toBe(1); expect(b).toBe(3);",
    );
  });

  test("a line whose only literal is not an argument of a matcher is refused", () => {
    for (const line of [
      "const total = 4;",
      "expect(4).toBe(total);",
      "expect(total).toBeTruthy();",
      'await page.locator("a").click();',
      'await page.evaluate("1");',
      'await request.delete("/x");',
      "expect(total).toBe(-1);",
      "expect(total).toBe(1e999);",
      "expect(total).toBe(9007199254740992);",
      "expect(total).toBe(4n);",
      "expect(total).toBe(true);",
      'export * from "./a";',
      'import { a } from "./a";',
      "expect(total).toMatch(/4/);",
    ]) {
      expect(() => mutateAssertion(line, 1), line).toThrow(NONE);
    }
  });

  test("a literal inside a template with substitutions, a regex or a comment is refused", () => {
    const substitution = ["expect(total).toBe(`a$", "{process.exit(1)}`);"].join("");
    for (const line of [
      substitution,
      "expect(total).toMatch(/a\\/b\\/(?:4)/);",
      "expect(total).toBe(total); // expect(total).toBe(4)",
      "// expect(total).toBe(4);",
      "/* expect(total).toBe(4); */",
      "const text = '\\' expect(total).toBe(4); ';",
    ]) {
      expect(() => mutateAssertion(line, 1), line).toThrow(NONE);
    }
  });

  test("lines are counted the way the language counts them, so a separator hides nothing", () => {
    const source = "const a = 1; // c expect(total).toBe(4);\nexpect(total).toBe(4);";
    expect(() => mutateAssertion(source, 1)).toThrow(NONE);
    expect(mutateAssertion(source, 2).source).toBe(source.replace("toBe(4)", "toBe(5)"));
    expect(mutateAssertion(source, 3).source).toBe(
      source.replace("toBe(4);", "toBe(4);").replace(/toBe\(4\);$/, "toBe(5);"),
    );
    const carriageReturn = "const a = 1; // c\rexpect(total).toBe(4);";
    expect(mutateAssertion(carriageReturn, 2).mutated).toBe("expect(total).toBe(5);");
    expect(() => mutateAssertion(carriageReturn, 1)).toThrow(NONE);
  });

  test("the mutated source is the original with only the literal's characters replaced", () => {
    const source =
      'import { expect, test } from "@playwright/test";\n\ntest("t", () => {\n  expect(f("a", 3)).toBe(4);\n});\n';
    expect(mutateAssertion(source, 4).source).toBe(source.replace("toBe(4)", "toBe(5)"));
  });

  test("a line outside the test is refused when the test's line is known", () => {
    const source =
      'import { expect, test } from "@playwright/test";\n\nfunction helper(): void {\n  expect(1).toBe(1);\n}\n\ntest("t", () => {\n  expect(2).toBe(2);\n  helper();\n});\n';
    expect(() => mutateAssertion(source, 4, 7)).toThrow("is not inside the test that starts on line 7");
    expect(mutateAssertion(source, 8, 7).mutated).toBe("  expect(2).toBe(3);");
    expect(mutateAssertion(source, 4).mutated).toBe("  expect(1).toBe(2);");
  });

  test("only the test call itself encloses an assertion, not a describe or a hook", () => {
    const source = [
      'import { expect, test } from "@playwright/test";',
      "",
      'test.describe("g", () => {',
      "  test.beforeEach(() => {",
      "    expect(1).toBe(1);",
      "  });",
      '  test.only("t", () => {',
      "    expect(2).toBe(2);",
      "  });",
      "});",
      "",
    ].join("\n");
    expect(() => mutateAssertion(source, 5, 4)).toThrow("is not inside the test that starts on line 4");
    expect(() => mutateAssertion(source, 5, 3)).toThrow("is not inside the test that starts on line 3");
    expect(() => mutateAssertion(source, 8, 3)).toThrow("is not inside the test that starts on line 3");
    expect(mutateAssertion(source, 8, 7).mutated).toBe("    expect(2).toBe(3);");
  });

  test("a spec that cannot be parsed is refused", () => {
    expect(() => mutateAssertion("expect(a).toBe(", 1)).toThrow("cannot be parsed");
  });
});

test.describe("the environment of the nested run (unit)", () => {
  test("drops what a Playwright worker sets for its children and keeps the rest", () => {
    const base = {
      PATH: "p",
      PLAYWRIGHT_BROWSERS_PATH: "b",
      PW_TEST_SOURCE_TRANSFORM: "x",
      TEST_WORKER_INDEX: "0",
      TEST_PARALLEL_INDEX: "0",
      FORCE_COLOR: "1",
      NODE_OPTIONS: "--require /repo/node_modules/playwright/lib/preload.js",
    };
    expect(childEnv(base, "report.json")).toEqual({
      PATH: "p",
      PLAYWRIGHT_BROWSERS_PATH: "b",
      PROVE_FAILS_FIXTURES: "1",
      PLAYWRIGHT_JSON_OUTPUT_FILE: "report.json",
    });
    expect(childEnv({ NODE_OPTIONS: "--max-old-space-size=4096" }, "r")["NODE_OPTIONS"]).toBe(
      "--max-old-space-size=4096",
    );
  });
});

test.describe("what may be proved (unit)", () => {
  test("a spec under .qa/ is refused before anything is read", async () => {
    await expect(proveFails(".qa/judge/x.test.ts", "t", 3)).rejects.toThrow("is under .qa/");
    await expect(proveFails(".qa/contracts/x.test.ts", "t", 3)).rejects.toThrow("is under .qa/");
  });

  test("a spec git ignores is refused, and the generated fixtures are allowed only with the flag", async () => {
    const before = status();
    const temporary = leftovers();
    mkdirSync("test-results", { recursive: true });
    writeFileSync(IGNORED_SPEC, `${HEADER}test("ignored", () => {\n  expect(1).toBe(1);\n});\n`);
    await expect(proveFails(IGNORED_SPEC, "ignored", 4)).rejects.toThrow("is ignored by git");
    const generated = generatedSpec("flagless", 'test("flagless", () => {\n  expect(1).toBe(1);\n});\n');
    delete process.env["PROVE_FAILS_FIXTURES"];
    try {
      await expect(proveFails(generated, "flagless", 4)).rejects.toThrow("is ignored by git");
    } finally {
      process.env["PROVE_FAILS_FIXTURES"] = "1";
    }
    expect((await proveFails(generated, "flagless", 4)).failed).toBe(true);
    expect(status()).toBe(before);
    expect(leftovers()).toEqual(temporary);
  });
});

test.describe("prove-fails (unit)", () => {
  test("proveFails mutates the line itself and leaves the working tree unchanged", async () => {
    const before = status();
    const trees = worktrees();
    const temporary = leftovers();
    const result = await proveFails(SPEC, TITLE, ASSERTION_LINE);
    expect(result.failed).toBe(true);
    expect(result.mutated).toBe("    expect(total).toBe(5);");
    expect(result.output).toContain("toBe");
    expect(status()).toBe(before);
    expect(worktrees()).toEqual(trees);
    expect(leftovers()).toEqual(temporary);
    expect(existsSync("node_modules/@playwright/test")).toBe(true);
    expect(readFileSync(SPEC, "utf8")).toContain("toBe(4)");
  });

  test("proveFails takes the project and reports failed: true for a number changed to one more", async () => {
    const result = await proveFails(SPEC, TITLE, ASSERTION_LINE, "unit");
    expect(result.failed).toBe(true);
    expect(result.output).toContain("5");
  });

  test("proveFails reports failed: false when the changed literal does not matter", async () => {
    const spec = generatedSpec(
      "loose",
      'test("loose bound", () => {\n  const total = 4;\n  expect(total).toBeLessThan(100);\n});\n',
    );
    const result = await proveFails(spec, "loose bound", 5);
    expect(result).toEqual({ failed: false, output: "the test passed", mutated: "  expect(total).toBeLessThan(101);" });
  });

  test("proveFails runs in a worktree outside the repository", async () => {
    process.env["PROVE_REPO_ROOT"] = process.cwd();
    const spec = generatedSpec(
      "outside",
      'test("runs outside the repository", () => {\n  const root = process.env["PROVE_REPO_ROOT"] ?? "";\n  const outside = root !== "" && !process.cwd().startsWith(root) ? 1 : 0;\n  expect(outside).toBe(1);\n});\n',
    );
    try {
      expect((await proveFails(spec, "runs outside the repository", 6)).failed).toBe(true);
    } finally {
      delete process.env["PROVE_REPO_ROOT"];
    }
  });

  test("proveFails sees a test that exists only in the working tree, even a git-ignored one", async () => {
    const spec = generatedSpec(
      "uncommitted",
      'test("subtracts", () => {\n  const left = 5 - 2;\n  expect(left).toBe(3);\n});\n',
    );
    expect((await proveFails(spec, "subtracts", 5)).failed).toBe(true);
  });

  test("proveFails changes a string literal", async () => {
    const spec = generatedSpec(
      "string",
      'test("names it", () => {\n  const name = "abc";\n  expect(name).toBe("abc");\n});\n',
    );
    const result = await proveFails(spec, "names it", 5);
    expect(result.failed).toBe(true);
    expect(result.mutated).toBe('  expect(name).toBe("abc__mutated__");');
  });

  test("proveFails does not take a flaky result for a proof", async () => {
    const spec = generatedSpec(
      "flaky",
      'test.describe.configure({ retries: 2 });\n\ntest("flaky one", ({}, testInfo) => {\n  expect(testInfo.retry).toBeGreaterThanOrEqual(0);\n});\n',
    );
    await expect(proveFails(spec, "flaky one", 6)).rejects.toThrow("is flaky");
  });

  test("proveFails refuses a test that is expected to fail", async () => {
    const spec = generatedSpec("known", 'test("known issue", () => {\n  test.fail();\n  expect(1).toBe(2);\n});\n');
    await expect(proveFails(spec, "known issue", 5)).rejects.toThrow("is expected to fail");
    const declared = generatedSpec("declared", 'test.fail("declared issue", () => {\n  expect(1).toBe(2);\n});\n');
    await expect(proveFails(declared, "declared issue", 4)).rejects.toThrow("is not inside the test");
  });

  test("proveFails refuses a line with no literal before it makes a worktree", async () => {
    const before = status();
    const temporary = leftovers();
    const spec = generatedSpec(
      "plain",
      'test("plain", () => {\n  const total = 4;\n  expect(total).toBeTruthy();\n});\n',
    );
    await expect(proveFails(spec, "plain", 5)).rejects.toThrow(NONE);
    await expect(proveFails(spec, "plain", 4)).rejects.toThrow(NONE);
    expect(status()).toBe(before);
    expect(leftovers()).toEqual(temporary);
  });

  test("proveFails refuses a line that is not inside the test it names", async () => {
    const spec = generatedSpec(
      "helper",
      'function helper(): void {\n  expect(1).toBe(1);\n}\n\ntest("uses it", () => {\n  helper();\n  expect(2).toBe(2);\n});\n',
    );
    await expect(proveFails(spec, "uses it", 4)).rejects.toThrow("is not inside the test");
    expect((await proveFails(spec, "uses it", 9)).failed).toBe(true);
  });

  test("proveFails refuses a test that fails before the change", async () => {
    const spec = generatedSpec("red", 'test("already red", () => {\n  expect(1).toBe(2);\n});\n');
    await expect(proveFails(spec, "already red", 4)).rejects.toThrow("fails before the change");
  });

  test("proveFails names what is wrong with its inputs", async () => {
    await expect(proveFails(SPEC, "no such title", ASSERTION_LINE)).rejects.toThrow("no test titled");
    await expect(proveFails("tests/unit/qa/fixtures/absent.test.ts", TITLE, ASSERTION_LINE)).rejects.toThrow(
      "is not a file",
    );
    await expect(proveFails("../outside.test.ts", TITLE, ASSERTION_LINE)).rejects.toThrow("inside the repository");
    await expect(proveFails(SPEC, TITLE, ASSERTION_LINE, "no-such-project")).rejects.toThrow("not found");
    for (const line of [0, -1, 1.5, Number.NaN]) {
      await expect(proveFails(SPEC, TITLE, line)).rejects.toThrow("line must be a positive whole number");
    }
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

  test("a normal unit run does not collect a generated fixture, and the prove run does", () => {
    const spec = generatedSpec("collected", 'test("collected", () => {\n  expect(1).toBe(1);\n});\n');
    const name = spec.slice(spec.lastIndexOf("/") + 1);
    expect(listedFiles(false).some((file) => file.endsWith(name))).toBe(false);
    expect(listedFiles(true).some((file) => file.endsWith(name))).toBe(true);
    expect(listedFiles(false).some((file) => file.endsWith("prove-fails-target.test.ts"))).toBe(true);
  });

  test("the CLI prints the verdict as JSON, the title may be several words, the line comes first", () => {
    const result = spawnSync(
      "node",
      ["qa/prove-fails.mts", SPEC, String(ASSERTION_LINE), "adds", "two", "numbers", "--project=unit"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ failed: true, mutated: "    expect(total).toBe(5);" });
  });

  test("the CLI exits 1 with one line on stderr for a wrong call", () => {
    for (const args of [[SPEC], [SPEC, "6"], [SPEC, "six", "adds"], [SPEC, "0", "adds"]]) {
      const result = spawnSync("node", ["qa/prove-fails.mts", ...args], { encoding: "utf8" });
      expect(result.status, args.join(" ")).toBe(1);
      expect(result.stderr.trim()).toMatch(/^[^\n]+$/);
    }
    expect(spawnSync("node", ["qa/prove-fails.mts", SPEC], { encoding: "utf8" }).stderr).toContain("usage");
  });
});
