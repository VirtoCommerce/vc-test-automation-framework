import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

import { expect, test } from "@playwright/test";

import { applyFacts, discardOnFailure, fillEnvText, setEnvValue, writeAnswers } from "../../../bin/lib/suite-files.mjs";

const TEMPLATE = join(import.meta.dirname, "..", "..", "..", "templates", "suite");
const TEMPLATE_FACTS = JSON.parse(readFileSync(join(TEMPLATE, ".qa", "project.json"), "utf8"));

function noAnswers() {
  return { env: {}, passwords: {}, persistPasswords: [], roles: {} };
}

test.describe("fillEnvText", () => {
  test("fills empty keys in place, keeps set and quoted ones, appends missing keys with the file's line ending", () => {
    expect(fillEnvText("A=\r\nB=keep\r\nC=''\r\n", { A: "1", B: "2", D: "4" })).toBe(
      "A=1\r\nB=keep\r\nC=''\r\nD=4\r\n",
    );
  });

  test("leaves comment lines untouched", () => {
    const text = "# A= is the platform\nA=\n#B=\n";

    expect(fillEnvText(text, { A: "1", B: "2" })).toBe("# A= is the platform\nA=1\n#B=\nB=2\n");
  });

  test("quotes a value that Node's .env parser would otherwise cut or trim", () => {
    const values = ["pa#ss", " edge ", `it's "both"`, "back\\slash", "new\\nline", `a'b\\n"c`, "plain-Value_1"];
    for (const value of values) {
      expect(parseEnv(fillEnvText("A=\n", { A: value }))["A"]).toBe(value);
    }
  });

  test("fills a key that the reader takes as empty: empty quotes or only a comment", () => {
    expect(fillEnvText("A=\"\"\nB= # note\nC=''\n", { A: "1", B: "2" })).toBe("A=1\nB=2 # note\nC=''\n");
  });

  test("refuses a value no quoting can hold, naming the key and not the value", () => {
    const value = "x'y\"z`w #c";

    expect(() => fillEnvText("A=\n", { A: value })).toThrow(/^A cannot be written to \.env/);
    expect(() => fillEnvText("A=\n", { A: value })).not.toThrow(/x'y/);
  });

  test("adds a line ending before an appended key when the file has none at its end", () => {
    expect(fillEnvText("A=x", { B: "2" })).toBe("A=x\nB=2\n");
  });
});

test.describe("setEnvValue", () => {
  test("changes a value that is set", () => {
    expect(setEnvValue("A=1\r\nVERIFY_SSL=true\r\n", "VERIFY_SSL", "false")).toBe("A=1\r\nVERIFY_SSL=false\r\n");
  });

  test("appends the key when it is missing", () => {
    expect(setEnvValue("A=1\n", "VERIFY_SSL", "false")).toBe("A=1\nVERIFY_SSL=false\n");
  });
});

test.describe("applyFacts", () => {
  test("replaces the template's logins and tracker and leaves the rest", () => {
    const facts = applyFacts(
      TEMPLATE_FACTS,
      {
        ...noAnswers(),
        roles: { customer: "buyer@shop.test", otherCustomer: "second@shop.test" },
        tracker: { kind: "azure-boards", keyPattern: "^\\d+$" },
      },
      "root",
    );

    expect(facts["roles"]).toEqual({
      administrator: "root",
      customer: "buyer@shop.test",
      "other customer": "second@shop.test",
    });
    expect(facts["tracker"]).toEqual({ ...TEMPLATE_FACTS.tracker, kind: "azure-boards", keyPattern: "^\\d+$" });
    expect(facts["commands"]).toEqual(TEMPLATE_FACTS.commands);
    expect(TEMPLATE_FACTS.roles.customer).toBe("customer@your-company.test");
  });

  test("changes nothing the answers do not carry", () => {
    expect(applyFacts(TEMPLATE_FACTS, noAnswers(), "admin")).toEqual(TEMPLATE_FACTS);
  });

  test("keeps an administrator role already changed from the template", () => {
    const facts = { ...TEMPLATE_FACTS, roles: { ...TEMPLATE_FACTS.roles, administrator: "owner" } };

    expect((applyFacts(facts, noAnswers(), "root")["roles"] as Record<string, string>)["administrator"]).toBe("owner");
  });
});

test.describe("writeAnswers", () => {
  let project: string;

  test.beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "vc-answers-"));
    mkdirSync(join(project, "tests-suite"));
    mkdirSync(join(project, ".qa"));
    writeFileSync(join(project, "tests-suite", ".env"), readFileSync(join(TEMPLATE, "env.example"), "utf8"));
    writeFileSync(join(project, ".qa", "project.json"), `${JSON.stringify(TEMPLATE_FACTS, null, 2)}\n`);
  });

  test.afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  test("writes only the persisted passwords, the env values and the facts, and keeps a value .env holds", () => {
    const envPath = join(project, "tests-suite", ".env");
    writeFileSync(envPath, readFileSync(envPath, "utf8").replace("STORE_ID=", "STORE_ID=Held-store"));
    writeAnswers(project, "tests-suite", {
      env: { STORE_ID: "Other-store", ADMIN_USERNAME: "root" },
      passwords: { ADMIN_PASSWORD: "typed-secret", CUSTOMER_PASSWORD: "shell-secret" },
      persistPasswords: ["ADMIN_PASSWORD"],
      roles: { customer: "buyer@shop.test" },
    });

    const env = readFileSync(join(project, "tests-suite", ".env"), "utf8");
    expect(env).toContain("ADMIN_PASSWORD=typed-secret\n");
    expect(env).not.toContain("shell-secret");
    expect(env).toContain("CUSTOMER_PASSWORD=\n");
    expect(env).toContain("STORE_ID=Held-store\n");
    expect(env).toContain("ADMIN_USERNAME=root\n");

    const facts = JSON.parse(readFileSync(join(project, ".qa", "project.json"), "utf8"));
    expect(facts.roles).toEqual({
      administrator: "root",
      customer: "buyer@shop.test",
      "other customer": "other.customer@your-company.test",
    });
    expect(JSON.stringify(facts)).not.toContain("secret");
  });

  test("names the administrator after the login written into the empty ADMIN_USERNAME", () => {
    const envPath = join(project, "tests-suite", ".env");

    writeAnswers(project, "tests-suite", { ...noAnswers(), env: { ADMIN_USERNAME: "root" } });

    expect(readFileSync(envPath, "utf8")).toContain("ADMIN_USERNAME=root\n");
    const facts = JSON.parse(readFileSync(join(project, ".qa", "project.json"), "utf8"));
    expect(facts.roles.administrator).toBe("root");
  });

  test("replaces the values .env already holds when told to", () => {
    writeAnswers(
      project,
      "tests-suite",
      { ...noAnswers(), env: { STORE_ID: "Other-store", BACKEND_BASE_URL: "https://back.example.test" } },
      { replace: true },
    );

    const env = readFileSync(join(project, "tests-suite", ".env"), "utf8");
    expect(env).toContain("STORE_ID=Other-store\n");
    expect(env).toContain("BACKEND_BASE_URL=https://back.example.test\n");
    expect(env).toContain("ADMIN_USERNAME=\n");
  });

  test("writes the suite at the project root when suiteDir is .", () => {
    writeFileSync(join(project, ".env"), "ADMIN_PASSWORD=\n");

    writeAnswers(project, ".", {
      ...noAnswers(),
      passwords: { ADMIN_PASSWORD: "x" },
      persistPasswords: ["ADMIN_PASSWORD"],
    });

    expect(readFileSync(join(project, ".env"), "utf8")).toBe("ADMIN_PASSWORD=x\n");
  });
});

test.describe("discardOnFailure", () => {
  let project: string;

  test.beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "vc-discard-"));
    writeFileSync(join(project, ".env"), "KEY=\n");
  });

  test.afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  test("removes the .env this run created when the questions are cancelled, so the next run is a first run", async () => {
    await expect(
      discardOnFailure(join(project, ".env"), true, () => Promise.reject(new Error("cancelled"))),
    ).rejects.toThrow("cancelled");

    expect(existsSync(join(project, ".env"))).toBe(false);
  });

  test("keeps a .env that existed before the run, and one whose answers were written", async () => {
    await expect(
      discardOnFailure(join(project, ".env"), false, () => Promise.reject(new Error("cancelled"))),
    ).rejects.toThrow("cancelled");
    const value = await discardOnFailure(join(project, ".env"), true, () => Promise.resolve(42));

    expect(value).toBe(42);
    expect(existsSync(join(project, ".env"))).toBe(true);
  });
});
