import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const BIN = fileURLToPath(new URL("../../../bin/install-qa-agents.mjs", import.meta.url));

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

  test("prints the readiness table of an initialized directory and exits 0", () => {
    expect(agents(dir, "init", "--skip-install", "--skip-verify", "--yes").status).toBe(0);

    const result = agents(dir, "doctor", "--skip-verify");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^skipped\s+backend\s+--skip-verify: no network checks$/m);
    expect(result.stdout).toMatch(/^skipped\s+browser server\s/m);
    expect(result.stdout).toMatch(/^(Ready|Not ready):/m);
    expect(result.stdout).not.toContain("Installed the QA agents");
  });
});
