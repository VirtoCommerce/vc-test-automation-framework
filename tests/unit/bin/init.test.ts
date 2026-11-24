import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const BIN = fileURLToPath(new URL("../../../bin/install-qa-agents.mjs", import.meta.url));

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
