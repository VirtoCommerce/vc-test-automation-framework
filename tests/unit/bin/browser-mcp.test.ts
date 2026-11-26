import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { prepareLaunch, serverArguments } from "../../../.claude/checks/browser-mcp.mts";
import { BROWSER_SECRETS_PATH, signInStatus, tolerantRunVariables } from "../../../.claude/checks/browser-secrets.mts";

const CHECKS = fileURLToPath(new URL("../../../.claude/checks", import.meta.url));
const TEMPLATE_FACTS = fileURLToPath(new URL("../../../templates/suite/.qa/project.json", import.meta.url));
const PASSWORD_NAMES = ["ADMIN_PASSWORD", "CUSTOMER_PASSWORD", "OTHER_CUSTOMER_PASSWORD"];

function writeProject(dir: string, env: string, factsText = readFileSync(TEMPLATE_FACTS, "utf8")): void {
  mkdirSync(join(dir, ".qa"), { recursive: true });
  writeFileSync(join(dir, ".qa", "project.json"), factsText);
  writeFileSync(join(dir, ".env"), env);
}

test.describe("browser MCP launcher", () => {
  let dir = "";

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vc browser mcp "));
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("passes the passwords that are set and skips the unset ones with a warning", () => {
    writeProject(dir, "ADMIN_PASSWORD=admin-secret\nCUSTOMER_PASSWORD=\n");

    const launch = prepareLaunch(dir, { OTHER_CUSTOMER_PASSWORD: "other-secret" });

    expect(launch.secrets).toEqual({ ADMIN_PASSWORD: "admin-secret", OTHER_CUSTOMER_PASSWORD: "other-secret" });
    expect(launch.skipped).toEqual(["CUSTOMER_PASSWORD"]);
    expect(launch.warnings.join("\n")).toContain("CUSTOMER_PASSWORD");
    expect(launch.warnings.join("\n")).not.toContain("secret");
  });

  test("skips a password the secrets file cannot hold and keeps the others", () => {
    writeProject(dir, "ADMIN_PASSWORD=a'b\nCUSTOMER_PASSWORD=c1\nOTHER_CUSTOMER_PASSWORD=o1\n");

    const launch = prepareLaunch(dir, {});

    expect(launch.secrets).toEqual({ CUSTOMER_PASSWORD: "c1", OTHER_CUSTOMER_PASSWORD: "o1" });
    expect(launch.skipped).toEqual(["ADMIN_PASSWORD"]);
    expect(launch.warnings.join("\n")).toContain("ADMIN_PASSWORD");
    expect(launch.warnings.join("\n")).not.toContain("a'b");
  });

  test("reads the passwords of facts that are still the template, and the suite's .env of its suiteDir", () => {
    const facts = { ...JSON.parse(readFileSync(TEMPLATE_FACTS, "utf8")), suiteDir: "suite" };
    writeProject(dir, "", JSON.stringify(facts));
    mkdirSync(join(dir, "suite"));
    writeFileSync(join(dir, "suite", ".env"), "ADMIN_PASSWORD=from-suite\n");

    const read = tolerantRunVariables(dir, {});

    expect(read.names).toEqual(PASSWORD_NAMES);
    expect(read.warnings).toEqual([]);
    expect(read.vars["ADMIN_PASSWORD"]).toBe("from-suite");
    expect(prepareLaunch(dir, {}).secrets).toEqual({ ADMIN_PASSWORD: "from-suite" });
  });

  test("falls back to the root .env with no password when the facts are not JSON", () => {
    writeProject(dir, "ADMIN_PASSWORD=admin-secret\n", "{ not json");

    const read = tolerantRunVariables(dir, {});
    const launch = prepareLaunch(dir, {});

    expect(read.names).toEqual([]);
    expect(read.warnings).toHaveLength(1);
    expect(read.vars["ADMIN_PASSWORD"]).toBe("admin-secret");
    expect(launch.secrets).toEqual({});
    expect(launch.warnings.length).toBeGreaterThan(0);
  });

  test("starts the pinned server, with the secrets file only when it has one", () => {
    expect(serverArguments(false)).toEqual(["-y", "@playwright/mcp@0.0.84", "--browser", "chromium", "--isolated"]);
    expect(serverArguments(false)).not.toContain("--secrets");
    expect(serverArguments(true).slice(-2)).toEqual(["--secrets", BROWSER_SECRETS_PATH]);
  });

  test("lets the browser accept an unverifiable certificate only when the run's variables say VERIFY_SSL=false", () => {
    writeProject(dir, "VERIFY_SSL=false\n");

    expect(prepareLaunch(dir, {}).ignoreHttpsErrors).toBe(true);
    expect(prepareLaunch(dir, { VERIFY_SSL: "true" }).ignoreHttpsErrors).toBe(false);
    writeProject(dir, "VERIFY_SSL=true\n");
    expect(prepareLaunch(dir, {}).ignoreHttpsErrors).toBe(false);
    expect(prepareLaunch(dir, { VERIFY_SSL: "false" }).ignoreHttpsErrors).toBe(true);
    expect(serverArguments(false, true).at(-1)).toBe("--ignore-https-errors");
    expect(serverArguments(true, true).slice(-3)).toEqual(["--secrets", BROWSER_SECRETS_PATH, "--ignore-https-errors"]);
    expect(serverArguments(true)).not.toContain("--ignore-https-errors");
  });

  test("--prepare-only writes the secrets file of a project in a path with a space, and prints nothing", () => {
    cpSync(CHECKS, join(dir, ".claude", "checks"), { recursive: true });
    writeProject(dir, "ADMIN_PASSWORD=admin-secret\n");
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !PASSWORD_NAMES.includes(name)));

    const result = spawnSync(process.execPath, [join(dir, ".claude", "checks", "browser-mcp.mts"), "--prepare-only"], {
      cwd: tmpdir(),
      encoding: "utf8",
      env,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("admin-secret");
    expect(result.stderr).toContain("CUSTOMER_PASSWORD");
    expect(readFileSync(join(dir, BROWSER_SECRETS_PATH), "utf8")).toBe("ADMIN_PASSWORD='admin-secret'\n");
  });

  test("takes no suiteDir outside the repository, and warns instead of stopping on a .env it cannot read", () => {
    const facts = { ...JSON.parse(readFileSync(TEMPLATE_FACTS, "utf8")), suiteDir: "../elsewhere" };
    writeProject(dir, "ADMIN_PASSWORD=from-root\n", JSON.stringify(facts));

    const outside = tolerantRunVariables(dir, {});

    expect(outside.vars["ADMIN_PASSWORD"]).toBe("from-root");
    expect(outside.warnings.join("\n")).toContain("suiteDir");

    rmSync(join(dir, ".env"));
    mkdirSync(join(dir, ".env"));

    const unreadable = prepareLaunch(dir, { CUSTOMER_PASSWORD: "c1" });

    expect(unreadable.secrets).toEqual({ CUSTOMER_PASSWORD: "c1" });
    expect(unreadable.warnings.join("\n")).toContain(".env cannot be read");
  });

  test("--prepare-only removes the secrets file of an earlier start when no password is set", () => {
    cpSync(CHECKS, join(dir, ".claude", "checks"), { recursive: true });
    writeProject(dir, "");
    writeFileSync(join(dir, BROWSER_SECRETS_PATH), "ADMIN_PASSWORD='old-secret'\n");
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !PASSWORD_NAMES.includes(name)));

    const result = spawnSync(process.execPath, [join(dir, ".claude", "checks", "browser-mcp.mts"), "--prepare-only"], {
      cwd: dir,
      encoding: "utf8",
      env,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(join(dir, BROWSER_SECRETS_PATH))).toBe(false);
  });

  test("sign-in is ready when every password is set, and names the unset ones otherwise", () => {
    writeProject(dir, "ADMIN_PASSWORD=a\nCUSTOMER_PASSWORD=c\n");

    expect(signInStatus(dir, { OTHER_CUSTOMER_PASSWORD: "o" })).toBe("ready");
    const status = signInStatus(dir, {});
    expect(status).toContain("OTHER_CUSTOMER_PASSWORD");
    expect(status).not.toContain("ADMIN_PASSWORD");
    expect(status).not.toContain(BROWSER_SECRETS_PATH);
  });

  test("sign-in is not ready for a password the launcher cannot pass, and says why without the value", () => {
    writeProject(dir, "ADMIN_PASSWORD=a'b\nCUSTOMER_PASSWORD=c\nOTHER_CUSTOMER_PASSWORD=o\n");

    const status = signInStatus(dir, {});

    expect(status).toContain("ADMIN_PASSWORD holds a quote or a line break");
    expect(status).not.toContain("a'b");
  });
});
