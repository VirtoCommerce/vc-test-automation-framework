import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const BIN = fileURLToPath(new URL("../../../bin/vc-qa-agents.mjs", import.meta.url));

function initIn(dir: string): string {
  return execFileSync(process.execPath, [BIN, "init", "--skip-install"], { cwd: dir, encoding: "utf8" });
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

test.describe("vc-qa-agents init", () => {
  let dir = "";

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vc-init-"));
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("writes a suite that runs from the root, with the agents and their facts", () => {
    initIn(dir);

    for (const file of [
      "playwright.config.ts",
      "env.ts",
      "fixtures/index.ts",
      "arrange/index.ts",
      "tests/restapi/security/sign-in.spec.ts",
      "biome.json",
      "CLAUDE.md",
      ".gitignore",
      ".env.example",
      ".env",
      ".claude/skills/framework-rules/SKILL.md",
      ".claude/settings.json",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }
    expect(existsSync(join(dir, "biome.template.json"))).toBe(false);
    expect(readJson(join(dir, ".qa", "project.json"))).toMatchObject({ suiteDir: "." });
  });

  test("adds the scripts to package.json and keeps the ones that exist", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "suite", scripts: { test: "custom" } }));

    initIn(dir);

    expect(readJson(join(dir, "package.json"))).toMatchObject({
      name: "suite",
      type: "module",
      scripts: { test: "custom", codegen: expect.any(String), report: expect.any(String) },
    });
  });

  test("replaces the placeholder test script of npm init", () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "suite", scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
    );

    initIn(dir);

    expect(readJson(join(dir, "package.json"))).toMatchObject({ scripts: { test: "playwright test" } });
  });

  test("keeps the files that already exist", () => {
    writeFileSync(join(dir, "env.ts"), "export {};\n");

    const output = initIn(dir);

    expect(readFileSync(join(dir, "env.ts"), "utf8")).toBe("export {};\n");
    expect(output).toContain("Kept the files that already exist: env.ts");
  });
});

test.describe("vc-qa-agents install", () => {
  let dir = "";

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vc-install-"));
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("appends the missing entries to .gitignore and keeps the existing ones", () => {
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n.qa/runs/");

    const output = execFileSync(process.execPath, [BIN], { cwd: dir, encoding: "utf8" });

    const lines = readFileSync(join(dir, ".gitignore"), "utf8").split("\n");
    expect(lines.slice(0, 3)).toEqual(["node_modules/", ".qa/runs/", ".qa/contracts/"]);
    expect(lines.filter((line) => line === ".qa/runs/")).toHaveLength(1);
    expect(lines).toContain(".playwright-mcp/");
    expect(output).toContain("Added to .gitignore: .qa/contracts/");
  });

  test("leaves .gitignore alone on a second run", () => {
    execFileSync(process.execPath, [BIN], { cwd: dir });
    const first = readFileSync(join(dir, ".gitignore"), "utf8");

    const output = execFileSync(process.execPath, [BIN], { cwd: dir, encoding: "utf8" });

    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(first);
    expect(output).not.toContain(".gitignore");
  });

  test("the facts reader fails while the example accounts are left in", () => {
    execFileSync(process.execPath, [BIN], { cwd: dir });

    const result = spawnSync(process.execPath, [".claude/checks/project-facts.mts"], { cwd: dir, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('roles["shop admin"] is the example account "admin@your-company.test"');
  });

  test("the facts reader fails while the example tracker project is left in", () => {
    execFileSync(process.execPath, [BIN], { cwd: dir });
    const path = join(dir, ".qa", "project.json");
    const facts = readJson(path);
    writeFileSync(
      path,
      JSON.stringify({
        ...facts,
        roles: { "shop admin": "admin", buyer: "buyer@acme.com", "other buyer": "other@acme.com" },
      }),
    );

    const result = spawnSync(process.execPath, [".claude/checks/project-facts.mts"], { cwd: dir, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("tracker.keyPattern names the example project PROJ");
  });
});

test.describe("vc-qa-agents arguments", () => {
  let dir = "";

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vc-args-"));
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const cases = [
    { args: ["install"], error: 'Unknown command "install"' },
    { args: ["--help"], error: 'Unknown command "--help"' },
    { args: ["init", "--skip-instal"], error: 'Unknown option "--skip-instal" of init' },
  ];

  for (const { args, error } of cases) {
    test(`fails on ${args.join(" ")} and writes nothing`, () => {
      const result = spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: "utf8" });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(error);
      expect(result.stderr).toContain("Usage:");
      expect(readdirSync(dir)).toEqual([]);
    });
  }
});
