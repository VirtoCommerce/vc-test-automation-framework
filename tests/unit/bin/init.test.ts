import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
      ".claude/skills/vc-framework-rules/SKILL.md",
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

  test("gives the suite the package's glob and minimatch overrides, keeping the ones it has", () => {
    const own = readJson(join(PACKAGE_ROOT, "package.json"))["overrides"] as Record<string, string>;
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "suite", overrides: { glob: "9.0.0" } }));

    initIn(dir);

    expect(readJson(join(dir, "package.json"))["overrides"]).toEqual({ glob: "9.0.0", minimatch: own["minimatch"] });
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

const PACKAGE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MANIFEST = ".claude/.vc-qa-agents.json";
const SHIPPED = ".claude/skills/vc-framework-rules/SKILL.md";
const OTHER_SHIPPED = ".claude/agents/vc-qa-judge.md";
const SAME_NAME = ".claude/commands/vc-qa.md";
const GUARD = ".claude/hooks/readonly-shell.mts";

function agents(dir: string, ...args: string[]): string {
  return execFileSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: "utf8" });
}

function writeIn(dir: string, path: string, content: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
}

function readIn(dir: string, path: string): string {
  return readFileSync(join(dir, path), "utf8");
}

function manifestFiles(dir: string): Record<string, string> {
  return readJson(join(dir, MANIFEST))["files"] as Record<string, string>;
}

function recordIn(dir: string, files: Record<string, string>): void {
  const manifest = readJson(join(dir, MANIFEST));
  writeFileSync(join(dir, MANIFEST), JSON.stringify({ ...manifest, files: { ...manifestFiles(dir), ...files } }));
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function shipped(path: string): string {
  return readFileSync(join(PACKAGE_ROOT, path), "utf8");
}

test.describe("vc-qa-agents install and uninstall", () => {
  let dir = "";

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vc-agents-"));
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("records every file it installs, with the package and its version", () => {
    agents(dir);

    const manifest = readJson(join(dir, MANIFEST));
    const own = JSON.parse(shipped("package.json")) as { name: string; version: string };
    expect(manifest).toMatchObject({ package: own.name, version: own.version });
    expect(manifestFiles(dir)[SHIPPED]).toBe(sha256(shipped(SHIPPED)));
    expect(manifestFiles(dir)).not.toHaveProperty([".claude/settings.json"]);
  });

  test("keeps a file of the repository that has the name of a package file, under any flag", () => {
    writeIn(dir, SAME_NAME, "the repository's own command\n");
    writeIn(dir, ".claude/agents/my-agent.md", "the repository's own agent\n");
    agents(dir);

    const output = agents(dir, "--force-ours");

    expect(readIn(dir, SAME_NAME)).toBe("the repository's own command\n");
    expect(readIn(dir, ".claude/agents/my-agent.md")).toBe("the repository's own agent\n");
    expect(manifestFiles(dir)).not.toHaveProperty([SAME_NAME]);
    expect(manifestFiles(dir)).not.toHaveProperty([".claude/agents/my-agent.md"]);
    expect(output).toContain(`Kept ${SAME_NAME}: it belongs to this repository`);
    expect(output).not.toContain("my-agent.md");
  });

  test("replaces a file it installed and nobody changed with the package's version", () => {
    agents(dir);
    writeIn(dir, SHIPPED, "an earlier version\n");
    recordIn(dir, { [SHIPPED]: sha256("an earlier version\n") });

    const output = agents(dir);

    expect(readIn(dir, SHIPPED)).toBe(shipped(SHIPPED));
    expect(manifestFiles(dir)[SHIPPED]).toBe(sha256(shipped(SHIPPED)));
    expect(output).toContain(" 1 updated,");
  });

  test("takes a file that differs from the one it installed only in line endings as unchanged", () => {
    agents(dir);
    writeIn(dir, SHIPPED, shipped(SHIPPED).replaceAll("\n", "\r\n"));

    const output = agents(dir);

    expect(output).toContain(" 0 updated,");
    expect(output).not.toContain(`Kept ${SHIPPED}`);
  });

  test("keeps a file it installed that was edited, and replaces it only with --force-ours", () => {
    agents(dir);
    writeIn(dir, SHIPPED, "edited here\n");

    const output = agents(dir);

    expect(readIn(dir, SHIPPED)).toBe("edited here\n");
    expect(output).toContain(`Kept ${SHIPPED}: edited since vc-qa-agents installed it`);
    expect(output).toContain("vc-qa-agents --force-ours");
    expect(manifestFiles(dir)[SHIPPED]).toBe(sha256(shipped(SHIPPED)));

    agents(dir, "--force-ours");

    expect(readIn(dir, SHIPPED)).toBe(shipped(SHIPPED));
  });

  test("removes a file the package no longer ships, unless it was edited", () => {
    agents(dir);
    writeIn(dir, ".claude/skills/retired/SKILL.md", "retired\n");
    writeIn(dir, ".claude/skills/retired-edited/SKILL.md", "edited here\n");
    recordIn(dir, {
      ".claude/skills/retired/SKILL.md": sha256("retired\n"),
      ".claude/skills/retired-edited/SKILL.md": sha256("retired\n"),
    });

    const output = agents(dir);

    expect(existsSync(join(dir, ".claude/skills/retired"))).toBe(false);
    expect(readIn(dir, ".claude/skills/retired-edited/SKILL.md")).toBe("edited here\n");
    expect(output).toContain("Kept .claude/skills/retired-edited/SKILL.md: the package no longer ships it");
    expect(manifestFiles(dir)).not.toHaveProperty([".claude/skills/retired/SKILL.md"]);
    expect(manifestFiles(dir)).toHaveProperty([".claude/skills/retired-edited/SKILL.md"]);
  });

  test("takes as its own, on an install without a manifest, only the files equal to the package's", () => {
    agents(dir);
    rmSync(join(dir, MANIFEST));
    writeIn(dir, SHIPPED, "a copy from an earlier version\n");

    const output = agents(dir, "--force-ours");

    expect(readIn(dir, SHIPPED)).toBe("a copy from an earlier version\n");
    expect(manifestFiles(dir)).not.toHaveProperty([SHIPPED]);
    expect(manifestFiles(dir)).toHaveProperty([OTHER_SHIPPED]);
    expect(output).toContain("recorded from an earlier install");
    expect(output).toContain(`Kept ${SHIPPED}: it differs from the package's file and nothing records it`);
  });

  test("replaces an install of the names before the vc- prefix, keeping and naming the edited ones", () => {
    const earlier = {
      ".claude/agents/qa-judge.md": "the earlier judge\n",
      ".claude/skills/framework-rules/SKILL.md": "the earlier rules\n",
      ".claude/commands/qa.md": "the earlier command\n",
    };
    for (const [path, content] of Object.entries(earlier)) {
      writeIn(dir, path, content);
    }
    const files = Object.fromEntries(Object.entries(earlier).map(([path, content]) => [path, sha256(content)]));
    writeIn(dir, MANIFEST, JSON.stringify({ package: "earlier", version: "0.0.1", files }));
    writeIn(dir, ".claude/commands/qa.md", "edited here\n");

    const output = agents(dir);

    expect(existsSync(join(dir, ".claude/agents/qa-judge.md"))).toBe(false);
    expect(existsSync(join(dir, ".claude/skills/framework-rules"))).toBe(false);
    expect(readIn(dir, OTHER_SHIPPED)).toBe(shipped(OTHER_SHIPPED));
    expect(readIn(dir, SHIPPED)).toBe(shipped(SHIPPED));
    expect(readIn(dir, SAME_NAME)).toBe(shipped(SAME_NAME));
    expect(readIn(dir, ".claude/commands/qa.md")).toBe("edited here\n");
    expect(output).toContain(" 2 removed that the package no longer ships");
    expect(output).toContain(
      `Kept .claude/commands/qa.md: the package no longer ships it, but it was edited since it was installed. ` +
        `The package now ships it as ${SAME_NAME}.`,
    );
    expect(Object.keys(manifestFiles(dir)).filter((path) => path in earlier)).toEqual([".claude/commands/qa.md"]);
  });

  test("names the files of the names before the vc- prefix on an install without a manifest, and keeps them", () => {
    writeIn(dir, ".claude/agents/qa-judge.md", "the earlier judge\n");
    writeIn(dir, ".claude/skills/framework-rules/SKILL.md", "the earlier rules\n");
    writeIn(dir, ".claude/skills/framework-rules/notes.md", "the earlier notes\n");
    writeIn(dir, GUARD, "the earlier hook\n");

    const output = agents(dir);

    expect(readIn(dir, ".claude/agents/qa-judge.md")).toBe("the earlier judge\n");
    expect(readIn(dir, ".claude/skills/framework-rules/SKILL.md")).toBe("the earlier rules\n");
    expect(readIn(dir, OTHER_SHIPPED)).toBe(shipped(OTHER_SHIPPED));
    expect(readIn(dir, GUARD)).toBe("the earlier hook\n");
    expect(output).toContain(
      "Kept 2 agents, commands and skills under the names they had before the vc- prefix, which nothing records as " +
        "the package's: .claude/agents/qa-judge.md, .claude/skills/framework-rules/. The package ships each as vc-<name>",
    );
    expect(output).toContain(`Not the package's version: ${GUARD}. The read-only agents are restricted only by`);
    expect(manifestFiles(dir)).not.toHaveProperty([".claude/agents/qa-judge.md"]);
    expect(manifestFiles(dir)).not.toHaveProperty([GUARD]);
  });

  test("uninstall removes exactly the files it installed unchanged, and the manifest", () => {
    writeIn(dir, SAME_NAME, "the repository's own command\n");
    writeIn(dir, ".claude/agents/my-agent.md", "the repository's own agent\n");
    writeIn(dir, ".claude/settings.json", "{}\n");
    agents(dir);
    writeIn(dir, SHIPPED, "edited here\n");

    const output = agents(dir, "uninstall");

    expect(readIn(dir, SAME_NAME)).toBe("the repository's own command\n");
    expect(readIn(dir, ".claude/agents/my-agent.md")).toBe("the repository's own agent\n");
    expect(readIn(dir, ".claude/settings.json")).toBe("{}\n");
    expect(readIn(dir, SHIPPED)).toBe("edited here\n");
    expect(output).toContain(`Kept ${SHIPPED}: edited since vc-qa-agents installed it`);
    for (const path of [OTHER_SHIPPED, ".claude/hooks", MANIFEST]) {
      expect(existsSync(join(dir, path)), path).toBe(false);
    }
  });

  test("uninstall without a manifest removes nothing", () => {
    writeIn(dir, OTHER_SHIPPED, shipped(OTHER_SHIPPED));

    const output = agents(dir, "uninstall");

    expect(readIn(dir, OTHER_SHIPPED)).toBe(shipped(OTHER_SHIPPED));
    expect(output).toContain("nothing was removed");
  });

  test("refuses a manifest that names a file outside the agents' directories", () => {
    writeIn(dir, "outside.txt", "kept\n");
    writeIn(dir, MANIFEST, JSON.stringify({ files: { ".claude/agents/../../outside.txt": sha256("kept\n") } }));

    const result = spawnSync(process.execPath, [BIN, "uninstall"], { cwd: dir, encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("is not the list of files vc-qa-agents installed");
    expect(readIn(dir, "outside.txt")).toBe("kept\n");
  });
});
