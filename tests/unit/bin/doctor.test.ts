import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const BIN = fileURLToPath(new URL("../../../bin/vc-qa-agents.mjs", import.meta.url));
const NODE_MODULES = fileURLToPath(new URL("../../../node_modules", import.meta.url));
const FACT_FLAGS = [
  "--customer",
  "buyer@shop.test",
  "--other-customer",
  "second@shop.test",
  "--tracker",
  "jira",
  "--key-pattern",
  "^ABC-\\d+$",
];

function agents(dir: string, ...args: string[]) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: "utf8", timeout: 20_000 });
}

test.describe("vc-qa-agents doctor", () => {
  let dir = "";

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vc-doctor-"));
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("asks for the install first when the checks are missing", () => {
    const result = agents(dir, "doctor");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Run npx vc-qa-agents first: .claude/checks is missing.");
  });

  test("prints the readiness table of an initialized directory and exits 0 when no row fails, without calling skipped rows ready", () => {
    expect(agents(dir, "init", "--skip-install", "--skip-verify", "--yes", ...FACT_FLAGS).status).toBe(0);
    symlinkSync(NODE_MODULES, join(dir, "node_modules"), "junction");

    const result = agents(dir, "doctor", "--skip-verify");

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^skipped\s+backend\s+--skip-verify: no network checks$/m);
    expect(result.stdout).toMatch(/^skipped\s+browser server\s/m);
    expect(result.stdout).toMatch(/^ok\s+project facts\s/m);
    expect(result.stdout).toMatch(/^Not verified: backend /m);
    expect(result.stdout.indexOf("checking the project facts (node .claude/checks/project-facts.mts)…\n")).toBe(0);
    expect(result.stdout).not.toContain("Ready:");
    expect(result.stdout).not.toContain("Installed the QA agents");
  });

  test("exits 1 when a row fails, where init with the same facts exits 0", () => {
    const init = agents(dir, "init", "--skip-install", "--skip-verify", "--yes");
    symlinkSync(NODE_MODULES, join(dir, "node_modules"), "junction");

    const result = agents(dir, "doctor", "--skip-verify");

    expect(init.status).toBe(0);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/^fail\s+project facts\s/m);
    expect(result.stdout).toMatch(/^Not ready:/m);
  });
});
