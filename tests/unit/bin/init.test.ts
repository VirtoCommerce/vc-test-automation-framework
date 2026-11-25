import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { BROWSER_SECRETS_PATH, passwordNames } from "../../../.claude/checks/browser-secrets.mts";

const BIN = fileURLToPath(new URL("../../../bin/install-qa-agents.mjs", import.meta.url));
const NODE_MODULES = fileURLToPath(new URL("../../../node_modules", import.meta.url));

function initIn(dir: string, ...args: string[]): string {
  return execFileSync(process.execPath, [BIN, "init", ...args, "--skip-install"], { cwd: dir, encoding: "utf8" });
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

  test("writes the browser server that the agents sign in with, on the secrets file the check writes", () => {
    initIn(dir);

    const servers = readJson(join(dir, ".mcp.json"))["mcpServers"] as Record<string, { args: string[] }>;
    const args = servers["playwright"]?.args ?? [];
    expect(args.some((arg) => /^@playwright\/mcp@\d+\.\d+\.\d+$/.test(arg))).toBe(true);
    expect(args[args.indexOf("--secrets") + 1]).toBe(BROWSER_SECRETS_PATH);
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain(".qa/*.local.env");
  });

  test("names, in the template's own .env.example, every password its facts name", () => {
    initIn(dir);

    const facts = readJson(join(dir, ".qa", "project.json"));
    const variables = readFileSync(join(dir, ".env.example"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.split("=")[0]);
    for (const name of passwordNames(facts["passwordFor"] as Record<string, string>)) {
      expect(variables, name).toContain(name);
    }
  });

  test("gives the suite facts that fail only on the placeholders, until they are replaced", () => {
    initIn(dir);
    symlinkSync(NODE_MODULES, join(dir, "node_modules"), "junction");

    const result = spawnSync(process.execPath, [join(dir, ".claude", "checks", "project-facts.mts")], {
      cwd: dir,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    const lines = result.stderr.trim().split(/\r?\n/);
    expect(lines).toHaveLength(3);
    expect(lines.join("\n")).toContain("template's example account");
    expect(lines.join("\n")).toContain("template's example key pattern");
  });
  test("writes a suite in a directory as its own npm project, with the agents and the facts at the root", () => {
    const suiteDir = "tests-suite";
    initIn(dir, suiteDir);
    symlinkSync(NODE_MODULES, join(dir, suiteDir, "node_modules"), "junction");

    for (const file of ["playwright.config.ts", "package.json", "pages/README.md", ".env"]) {
      expect(existsSync(join(dir, suiteDir, file)), file).toBe(true);
    }
    for (const file of [".claude/settings.json", ".mcp.json"]) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }
    expect(existsSync(join(dir, "package.json"))).toBe(false);
    expect(existsSync(join(dir, suiteDir, ".qa"))).toBe(false);
    const factsPath = join(dir, ".qa", "project.json");
    const facts = readJson(factsPath);
    expect(facts).toMatchObject({ suiteDir, healerPaths: expect.arrayContaining([`${suiteDir}/pages/`]) });
    const placeholders = readFileSync(factsPath, "utf8")
      .replaceAll("@your-company.test", "@example.org")
      .replace("PROJ-", "SUITE-");
    writeFileSync(factsPath, placeholders);

    const result = spawnSync(process.execPath, [join(dir, ".claude", "checks", "project-facts.mts")], {
      cwd: dir,
      encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      playwright: `npm exec --prefix ${suiteDir} --no -- playwright test --config=${suiteDir}`,
    });
  });

  test("refuses a suite directory outside the repository", () => {
    const result = spawnSync(process.execPath, [BIN, "init", "../elsewhere", "--skip-install"], {
      cwd: dir,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("plain directory inside the repository");
    expect(existsSync(join(dir, ".qa"))).toBe(false);
  });
});
