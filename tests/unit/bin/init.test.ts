import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { BROWSER_SECRETS_PATH, passwordNames } from "../../../.claude/checks/browser-secrets.mts";
import { browserServerKind } from "../../../bin/lib/browser-server.mjs";

const BIN = fileURLToPath(new URL("../../../bin/vc-qa-agents.mjs", import.meta.url));
const NODE_MODULES = fileURLToPath(new URL("../../../node_modules", import.meta.url));
const TEMPLATE_DIR = fileURLToPath(new URL("../../../templates/suite", import.meta.url));

const ASKED_VARIABLES = [
  "BACKEND_BASE_URL",
  "FRONTEND_BASE_URL",
  "STORE_ID",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "CUSTOMER_PASSWORD",
  "OTHER_CUSTOMER_PASSWORD",
  "FRONTEND_TEST_ID_ATTRIBUTE",
];

function shellWith(variables: Record<string, string> = {}): NodeJS.ProcessEnv {
  const shell = { ...process.env };
  for (const name of ASKED_VARIABLES) {
    delete shell[name];
  }
  return { ...shell, ...variables };
}

function initIn(dir: string, ...args: string[]): string {
  return execFileSync(process.execPath, [BIN, "init", ...args, "--skip-install", "--skip-verify", "--yes"], {
    cwd: dir,
    encoding: "utf8",
    env: shellWith(),
  });
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

  test("makes the first test read-only and keeps the user-creating one as an example", () => {
    initIn(dir);

    const signIn = readFileSync(join(dir, "tests/restapi/security/sign-in.spec.ts"), "utf8");
    expect(existsSync(join(dir, "tests/restapi/security/create-user.example.ts"))).toBe(true);
    expect(signIn).toContain("currentuser");
    expect(signIn).not.toContain("arrange");
  });

  test("makes the test id attribute a setting of the suite, and tells the agents where it is", () => {
    initIn(dir);

    const example = readFileSync(join(dir, ".env.example"), "utf8");
    expect(example).toContain("FRONTEND_TEST_ID_ATTRIBUTE=\n");
    expect(example).toMatch(/^# .*left empty: detected by init, else data-test-id$/m);
    expect(readFileSync(join(dir, "playwright.config.ts"), "utf8")).toContain(
      "testIdAttribute: env.FRONTEND_TEST_ID_ATTRIBUTE",
    );
    for (const skill of ["vc-create-ui-layer", "vc-explore-frontend"]) {
      expect(shipped(`.claude/skills/${skill}/SKILL.md`), skill).toContain("FRONTEND_TEST_ID_ATTRIBUTE");
    }
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

  test("writes the browser server that the agents sign in with, started by the launcher on every platform", () => {
    initIn(dir);

    const servers = readJson(join(dir, ".mcp.json"))["mcpServers"] as Record<
      string,
      { command: string; args: string[] }
    >;
    expect(servers["playwright"]).toEqual({ command: "node", args: [".claude/checks/browser-mcp.mts"] });
    expect(existsSync(join(dir, ".claude", "checks", "browser-mcp.mts"))).toBe(true);
    expect(browserServerKind(dir)).toBe("launcher");
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain(".qa/*.local.env");
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain(".claude/settings.local.json");
  });

  test("tells a suite whose browser server runs @playwright/mcp directly how to switch, and leaves the file", () => {
    const direct = `${JSON.stringify({
      mcpServers: {
        playwright: {
          command: "npx",
          args: ["-y", "@playwright/mcp@0.0.84", "--secrets", BROWSER_SECRETS_PATH],
        },
      },
    })}\n`;
    expect(browserServerKind(dir)).toBe("none");
    writeFileSync(join(dir, ".mcp.json"), direct);

    const output = execFileSync(process.execPath, [BIN], { cwd: dir, encoding: "utf8" });

    expect(browserServerKind(dir)).toBe("direct");
    expect(output).toContain(".claude/checks/browser-mcp.mts");
    expect(readFileSync(join(dir, ".mcp.json"), "utf8")).toBe(direct);
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

  test("gives the suite facts that pass with only the administrator: no customer, no tracker, no placeholder", () => {
    initIn(dir);
    symlinkSync(NODE_MODULES, join(dir, "node_modules"), "junction");

    const result = spawnSync(process.execPath, [join(dir, ".claude", "checks", "project-facts.mts")], {
      cwd: dir,
      encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const facts = readJson(join(dir, ".qa", "project.json"));
    expect(facts["roleFor"]).toEqual({ admin: "administrator" });
    expect(facts["tracker"]).toBeUndefined();
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
    const result = spawnSync(process.execPath, [join(dir, ".claude", "checks", "project-facts.mts")], {
      cwd: dir,
      encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      playwright: `npm exec --prefix ${suiteDir} --no -- playwright test --config=${suiteDir}`,
    });
  });

  test("--frontend-sign-in cookie writes the cookie stub into the fixtures it creates, and never into existing ones", () => {
    const first = initIn(dir, "--frontend-sign-in", "cookie");
    const fixtures = join(dir, "fixtures", "index.ts");
    const written = readFileSync(fixtures, "utf8");
    writeFileSync(fixtures, "export const test = 1;\n");

    const again = initIn(dir, "--frontend-sign-in", "cookie");

    expect(first).toContain("Wrote fixtures/index.ts with a cookie sign-in of the frontend");
    expect(written).toContain("defaultFixtures(env, { frontendSignIn })");
    expect(again).toContain("Kept your fixtures/index.ts; --frontend-sign-in cookie was not applied");
    expect(readFileSync(fixtures, "utf8")).toBe("export const test = 1;\n");
  });

  test("--frontend-sign-in oauth or none keeps the template's fixtures, and another value is refused before any write", () => {
    initIn(dir, "--frontend-sign-in", "oauth");
    const template = readFileSync(join(TEMPLATE_DIR, "fixtures", "index.ts"), "utf8");
    const other = mkdtempSync(join(tmpdir(), "vc-sign-in-"));
    try {
      const refused = spawnSync(process.execPath, [BIN, "init", "--skip-install", "--frontend-sign-in", "token"], {
        cwd: other,
        encoding: "utf8",
      });

      expect(readFileSync(join(dir, "fixtures", "index.ts"), "utf8")).toBe(template);
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain("--frontend-sign-in must be oauth or cookie");
      expect(existsSync(join(other, ".qa"))).toBe(false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  test("refuses --other-customer without a customer before it writes anything, the cookie stub included", () => {
    const refused = spawnSync(
      process.execPath,
      [BIN, "init", "--skip-install", "--yes", "--frontend-sign-in", "cookie", "--other-customer", "second@shop.test"],
      { cwd: dir, encoding: "utf8", env: shellWith() },
    );
    const sameAccount = spawnSync(
      process.execPath,
      [BIN, "init", "--skip-install", "--yes", "--customer", "a@shop.test", "--other-customer", "A@shop.test"],
      { cwd: dir, encoding: "utf8", env: shellWith() },
    );

    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("--other-customer needs --customer");
    expect(sameAccount.status).toBe(1);
    expect(sameAccount.stderr).toContain("--customer and --other-customer must be two accounts");
    expect(readdirSync(dir)).toEqual([]);

    const fine = initIn(
      dir,
      "--frontend-sign-in",
      "cookie",
      "--customer",
      "a@shop.test",
      "--other-customer",
      "b@shop.test",
    );

    expect(fine).toContain("Wrote fixtures/index.ts with a cookie sign-in of the frontend");
    expect(readFileSync(join(dir, "fixtures", "index.ts"), "utf8")).toContain(
      "defaultFixtures(env, { frontendSignIn })",
    );
    expect(readJson(join(dir, ".qa", "project.json"))["roleFor"]).toEqual({
      admin: "administrator",
      customer: "customer",
      otherCustomer: "other customer",
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

const FLAGS = [
  "--backend-url",
  "https://back.example.test",
  "--frontend-url",
  "https://front.example.test",
  "--store-id",
  "Flag-store",
  "--customer",
  "buyer@shop.test",
  "--other-customer",
  "second@shop.test",
  "--tracker",
  "jira",
  "--key-pattern",
  "^ABC-\\d+$",
];

function initRun(dir: string, args: string[], variables: Record<string, string> = {}) {
  return spawnSync(process.execPath, [BIN, "init", ...args], {
    cwd: dir,
    encoding: "utf8",
    env: shellWith(variables),
    timeout: 20_000,
  });
}

test.describe("vc-qa-agents init, asked and answered", () => {
  let dir = "";

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vc-init-answers-"));
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("ends with the readiness table and one verdict line, without the old list of next steps", () => {
    const result = initRun(dir, ["--skip-install", "--skip-verify", "--yes"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^Not verified: backend /m);
    expect(result.stdout).not.toContain("Ready:");
    expect(result.stdout).toMatch(/^skipped\s+backend\s+--skip-verify: no network checks$/m);
    expect(result.stdout).toMatch(/^ok\s+project facts\s/m);
    expect(result.stdout).not.toContain("Next:");
    expect(result.stdout).not.toContain("signs a new user in");
  });

  test("a run without flags reports the unset stand values in the table instead of crashing", () => {
    const result = initRun(dir, ["--skip-install", "--yes"]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^fail\s+backend\s+BACKEND_BASE_URL is empty; set it in \.env\.$/m);
    expect(result.stdout).toMatch(/^fail\s+frontend\s+FRONTEND_BASE_URL is empty; set it in \.env\.$/m);
    expect(result.stdout).toMatch(/^skipped\s+administrator\s+the platform does not answer$/m);
    const env = readFileSync(join(dir, ".env"), "utf8");
    expect(env).toContain("BACKEND_BASE_URL=\n");
    expect(env).toContain("STORE_ID=\n");
  });

  test("a run with skipped rows and no failing row says Not verified, never Ready", () => {
    const result = initRun(dir, ["--skip-install", "--skip-verify", "--yes", ...FLAGS]);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^Not verified: backend \(--skip-verify: no network checks\), /m);
    expect(result.stdout).toMatch(/^Run npx vc-qa-agents doctor once that is fixed\.$/m);
    expect(result.stdout).not.toContain("Ready:");
    expect(result.stdout).not.toContain("Not ready:");
  });

  test("writes the flags to .env and the logins and key pattern to the project facts", () => {
    const result = initRun(dir, ["--skip-install", "--skip-verify", "--yes", ...FLAGS]);

    expect(result.status, result.stderr).toBe(0);
    const env = readFileSync(join(dir, ".env"), "utf8");
    expect(env).toContain("BACKEND_BASE_URL=https://back.example.test\n");
    expect(env).toContain("FRONTEND_BASE_URL=https://front.example.test\n");
    expect(env).toContain("STORE_ID=Flag-store\n");
    expect(env).toContain("ADMIN_USERNAME=\n");
    expect(env).toContain("FRONTEND_TEST_ID_ATTRIBUTE=\n");
    const facts = readJson(join(dir, ".qa", "project.json"));
    expect(facts).toMatchObject({
      roles: { administrator: "admin", customer: "buyer@shop.test", "other customer": "second@shop.test" },
      tracker: { kind: "jira", keyPattern: "^ABC-\\d+$" },
    });
  });

  test("writes --docs first in docSources, keeps the template's entry, and a second run changes nothing", () => {
    const args = ["--skip-install", "--skip-verify", "--yes", ...FLAGS, "--docs", "mcp:team-wiki"];

    const result = initRun(dir, args);

    expect(result.status, result.stderr).toBe(0);
    const facts = readJson(join(dir, ".qa", "project.json"));
    expect(facts).toMatchObject({
      docSources: [
        { name: "Project documentation", route: "mcp", where: "team-wiki" },
        { name: "Virto Commerce documentation", route: "api", where: "https://docs.virtocommerce.org" },
      ],
    });
    const before = readFileSync(join(dir, ".qa", "project.json"), "utf8");

    const again = initRun(dir, [...args.slice(0, -1), "https://wiki.example.test"]);

    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toContain(
      "Kept docSources from .qa/project.json; --docs was not applied (edit .qa/project.json to change it).",
    );
    expect(readFileSync(join(dir, ".qa", "project.json"), "utf8")).toBe(before);
  });

  test("refuses an invalid --docs before writing anything", () => {
    const refused = initRun(dir, ["--skip-install", "--skip-verify", "--yes", "--docs", "mcp:"]);

    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("--docs");
    expect(existsSync(join(dir, ".env"))).toBe(false);
  });

  test("keeps a password from the shell out of .env unless --save-passwords is given", () => {
    const secret = "shell-only-secret";
    const unsaved = initRun(dir, ["--skip-install", "--skip-verify", "--yes"], { ADMIN_PASSWORD: secret });
    const other = mkdtempSync(join(tmpdir(), "vc-init-saved-"));
    try {
      const saved = initRun(other, ["--skip-install", "--skip-verify", "--yes", "--save-passwords"], {
        ADMIN_PASSWORD: secret,
      });

      expect(unsaved.status).toBe(0);
      expect(saved.status).toBe(0);
      expect(readFileSync(join(dir, ".env"), "utf8")).not.toContain(secret);
      expect(readFileSync(join(other, ".env"), "utf8")).toContain(`ADMIN_PASSWORD=${secret}\n`);
      expect(unsaved.stdout + saved.stdout).not.toContain(secret);
      expect(readFileSync(join(other, ".qa", "project.json"), "utf8")).not.toContain(secret);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  test("a second identical run leaves .env, the project facts and package.json byte-identical", () => {
    const args = ["--skip-install", "--skip-verify", "--yes", ...FLAGS];
    initRun(dir, args);
    const files = [".env", ".qa/project.json", "package.json"];
    const before = files.map((file) => readFileSync(join(dir, file), "utf8"));

    const again = initRun(dir, args);

    expect(again.status, again.stderr).toBe(0);
    expect(files.map((file) => readFileSync(join(dir, file), "utf8"))).toEqual(before);
  });

  test("refuses an invalid --backend-url before writing anything, so the corrected run is a first run", () => {
    const refused = initRun(dir, ["--skip-install", "--skip-verify", "--yes", "--backend-url", "localhost:8090"]);

    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("--backend-url");
    expect(existsSync(join(dir, ".env"))).toBe(false);

    const corrected = initRun(dir, ["--skip-install", "--skip-verify", "--yes", "--backend-url", "https://b.test"]);

    expect(corrected.status, corrected.stderr).toBe(0);
    expect(readFileSync(join(dir, ".env"), "utf8")).toContain("BACKEND_BASE_URL=https://b.test\n");
  });

  test("removes the .env it created when a later step fails, so the retry takes the flags", () => {
    writeFileSync(join(dir, "package.json"), "{ not json");

    const failed = initRun(dir, ["--skip-install", "--skip-verify", "--yes", ...FLAGS]);

    expect(failed.status).toBe(1);
    expect(existsSync(join(dir, ".env"))).toBe(false);

    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "suite" }));
    const retried = initRun(dir, ["--skip-install", "--skip-verify", "--yes", ...FLAGS]);

    expect(retried.status, retried.stderr).toBe(0);
    expect(readFileSync(join(dir, ".env"), "utf8")).toContain("BACKEND_BASE_URL=https://back.example.test\n");
  });

  test("says which flags it did not apply because .env already holds their keys", () => {
    initRun(dir, ["--skip-install", "--skip-verify", "--yes", ...FLAGS]);

    const again = initRun(dir, [
      "--skip-install",
      "--skip-verify",
      "--yes",
      ...FLAGS,
      "--frontend-url",
      "https://moved.example.test",
    ]);

    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toContain(
      "Kept FRONTEND_BASE_URL from .env; --frontend-url was not applied (edit .env to change it).",
    );
    expect(again.stdout).not.toContain("Kept BACKEND_BASE_URL");
    expect(readFileSync(join(dir, ".env"), "utf8")).toContain("FRONTEND_BASE_URL=https://front.example.test\n");
  });

  test("leaves to the readiness table what plain install would tell the user to do by hand", () => {
    const initOutput = initRun(dir, ["--skip-install", "--skip-verify", "--yes"]).stdout;
    const other = mkdtempSync(join(tmpdir(), "vc-install-"));
    try {
      const installOutput = execFileSync(process.execPath, [BIN], { cwd: other, encoding: "utf8" });

      for (const line of ["project-facts.mts refuses it until you have", "The checks need @babel/parser"]) {
        expect(initOutput, line).not.toContain(line);
        expect(installOutput, line).toContain(line);
      }
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  test("is not interactive without a terminal, so it never waits for input", () => {
    test.setTimeout(30_000);

    const result = initRun(dir, ["--skip-install", "--skip-verify"]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No terminal: nothing was asked; pass the values as flags or edit .env.");
    expect(initRun(dir, ["--skip-install", "--skip-verify", "--yes"]).stdout).not.toContain("No terminal");
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
    expect(lines).toContain(".claude/settings.local.json");
    expect(output).toContain("Added to .gitignore: .qa/contracts/");
  });

  test("keeps the line endings of a CRLF .gitignore", () => {
    writeFileSync(join(dir, ".gitignore"), "node_modules/\r\n");

    execFileSync(process.execPath, [BIN], { cwd: dir });

    const text = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(text.startsWith("node_modules/\r\n.qa/contracts/\r\n")).toBe(true);
    expect(text.replaceAll("\r\n", "")).not.toContain("\n");
  });

  test("leaves .gitignore alone on a second run", () => {
    execFileSync(process.execPath, [BIN], { cwd: dir });
    const first = readFileSync(join(dir, ".gitignore"), "utf8");

    const output = execFileSync(process.execPath, [BIN], { cwd: dir, encoding: "utf8" });

    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(first);
    expect(output).not.toContain(".gitignore");
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

const SHIM_SCRIPT_WINDOWS = [
  "@echo off",
  'echo %~n0 %* >> "%SHIM_LOG%"',
  'echo %* | findstr /c:"install-browser" >nul || exit /b 0',
  "echo WARNING: running without first installing your project's dependencies",
  'if "%SHIM_FAIL%"=="1" (echo Error: download of the browser failed 1>&2 & exit /b 1)',
  "exit /b 0",
  "",
].join("\r\n");

const SHIM_SCRIPT_POSIX = [
  "#!/bin/sh",
  'echo "$(basename "$0") $*" >> "$SHIM_LOG"',
  'case "$*" in *install-browser*) ;; *) exit 0;; esac',
  'echo "WARNING: running without first installing your project\'s dependencies"',
  'if [ "$SHIM_FAIL" = 1 ]; then echo "Error: download of the browser failed" >&2; exit 1; fi',
  "exit 0",
  "",
].join("\n");

function writeShims(shimDir: string): void {
  mkdirSync(shimDir, { recursive: true });
  for (const name of ["npm", "npx"]) {
    if (process.platform === "win32") {
      writeFileSync(join(shimDir, `${name}.cmd`), SHIM_SCRIPT_WINDOWS);
    } else {
      writeFileSync(join(shimDir, name), SHIM_SCRIPT_POSIX, { mode: 0o755 });
    }
  }
}

function shimmedRun(dir: string, shimDir: string, log: string, fail: boolean) {
  const env = shellWith({ SHIM_LOG: log, SHIM_FAIL: fail ? "1" : "0" });
  const pathName = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  env[pathName] = `${shimDir}${delimiter}${env[pathName] ?? ""}`;
  return spawnSync(process.execPath, [BIN, "init", "--skip-verify", "--yes", ...FLAGS], {
    cwd: dir,
    encoding: "utf8",
    env,
    timeout: 60_000,
  });
}

test.describe("vc-qa-agents init, installing", () => {
  let dir = "";
  let shimDir = "";

  test.beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vc-init-install-"));
    shimDir = mkdtempSync(join(tmpdir(), "vc-init-shims-"));
    writeShims(shimDir);
  });

  test.afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(shimDir, { recursive: true, force: true });
  });

  test("installs the suite's browser and then the browser server's own, read from the launcher", () => {
    const log = join(shimDir, "calls.log");

    const result = shimmedRun(dir, shimDir, log, false);

    expect(result.status, result.stderr).toBe(0);
    const calls = readFileSync(log, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /install/.test(line));
    expect(calls[0]).toMatch(/^npm install --save-dev --save-exact /);
    expect(calls[1]).toBe("npx playwright install chromium");
    expect(calls[2]).toMatch(/^npx -y @playwright\/mcp@\d+\.\d+\.\d+ install-browser chrome-for-testing$/);
    expect(result.stdout).toMatch(/^Installed the browser server's browser \(@playwright\/mcp@\d+\.\d+\.\d+\)\.$/m);
    expect(result.stdout).not.toContain("WARNING");
    expect(result.stdout).not.toContain("install-browser");
    expect(result.stdout).toMatch(
      /^installing the browser server's browser \(@playwright\/mcp@\d+\.\d+\.\d+\)\.\.\.$/m,
    );
  });

  test("goes on to the readiness table when the browser server's browser cannot be installed", () => {
    const log = join(shimDir, "calls.log");

    const result = shimmedRun(dir, shimDir, log, true);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "The browser server's own browser was not installed (Error: download of the browser failed).",
    );
    expect(result.stdout).not.toContain("WARNING");
    expect(result.stdout).toMatch(/^\S+\s+browser server\s/m);
  });
});
