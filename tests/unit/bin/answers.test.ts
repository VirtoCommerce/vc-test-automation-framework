import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { PASSWORD_NAMES, resolveAnswers as resolveUntyped } from "../../../bin/lib/answers.mjs";

type Answers = {
  env: Record<string, string>;
  passwords: Record<string, string>;
  persistPasswords: string[];
  roles: { customer?: string; otherCustomer?: string };
  tracker?: { kind: string; keyPattern: string };
};

type Input = Parameters<typeof resolveUntyped>[0];

function resolveAnswers(input: Input): Promise<Answers> {
  return resolveUntyped(input);
}

const TEMPLATE_FACTS = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "..", "templates", "suite", ".qa", "project.json"), "utf8"),
);

const FILLED_ENV = {
  BACKEND_BASE_URL: "https://back.example.test",
  FRONTEND_BASE_URL: "https://front.example.test",
  STORE_ID: "Store",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "a",
  CUSTOMER_PASSWORD: "c",
  OTHER_CUSTOMER_PASSWORD: "o",
  FRONTEND_TEST_ID_ATTRIBUTE: "data-test-id",
};

const CHANGED_FACTS = {
  ...TEMPLATE_FACTS,
  roles: { administrator: "admin", customer: "buyer@shop.test", "other customer": "second@shop.test" },
  tracker: { kind: "azure-boards", keyPattern: "^\\d+$", routes: ["paste"] },
};

function fakePrompter(replies: string[]) {
  const asked: string[] = [];
  const secretAsked: string[] = [];
  function next(question: string) {
    const reply = replies.shift();
    if (reply === undefined) {
      throw new Error(`unexpected question: ${question}`);
    }
    return reply;
  }
  return {
    asked,
    secretAsked,
    async ask(question: string, fallback?: string) {
      asked.push(question);
      const reply = next(question);
      return reply === "" && fallback !== undefined ? fallback : reply;
    },
    async askSecret(question: string) {
      secretAsked.push(question);
      return next(question);
    },
    async confirm(question: string) {
      asked.push(question);
      return next(question) === "y";
    },
    close() {},
  };
}

function input(overrides: Partial<Input> = {}): Input {
  return {
    values: {},
    switches: new Set<string>(),
    shell: {},
    existingEnv: {},
    facts: TEMPLATE_FACTS,
    ...overrides,
  };
}

test.describe("resolveAnswers", () => {
  test("names the three passwords", () => {
    expect(PASSWORD_NAMES).toEqual(["ADMIN_PASSWORD", "CUSTOMER_PASSWORD", "OTHER_CUSTOMER_PASSWORD"]);
  });

  test("a second run with a filled .env and changed facts asks nothing and returns nothing", async () => {
    const prompter = fakePrompter([]);

    const answers = await resolveAnswers(input({ existingEnv: FILLED_ENV, facts: CHANGED_FACTS, prompter }));

    expect(prompter.asked).toEqual([]);
    expect(prompter.secretAsked).toEqual([]);
    expect(answers.env).toEqual({});
    expect(answers.passwords).toEqual({});
    expect(answers.persistPasswords).toEqual([]);
    expect(answers.roles).toEqual({});
    expect(answers.tracker).toBeUndefined();
  });

  test("a flag beats the shell variable and the default", async () => {
    const answers = await resolveAnswers(
      input({
        values: { "--backend-url": "https://flag.example.test", "--admin-login": "root" },
        shell: { BACKEND_BASE_URL: "https://shell.example.test" },
      }),
    );

    expect(answers.env["BACKEND_BASE_URL"]).toBe("https://flag.example.test");
    expect(answers.env["ADMIN_USERNAME"]).toBe("root");
  });

  test("a shell variable beats the default, and the default fills what nothing gave", async () => {
    const answers = await resolveAnswers(input({ shell: { STORE_ID: "Shell-store" } }));

    expect(answers.env["STORE_ID"]).toBe("Shell-store");
    expect(answers.env["ADMIN_USERNAME"]).toBe("admin");
    expect(answers.env["FRONTEND_TEST_ID_ATTRIBUTE"]).toBe("data-test-id");
  });

  test("a shell password is used but saved only with --save-passwords", async () => {
    const shell = { ADMIN_PASSWORD: "from-shell" };

    const kept = await resolveAnswers(input({ shell }));
    expect(kept.passwords).toEqual({ ADMIN_PASSWORD: "from-shell" });
    expect(kept.persistPasswords).toEqual([]);
    expect(kept.env["ADMIN_PASSWORD"]).toBeUndefined();

    const saved = await resolveAnswers(input({ shell, switches: new Set(["--save-passwords"]) }));
    expect(saved.persistPasswords).toEqual(["ADMIN_PASSWORD"]);
  });

  test("a typed password is persisted, a blank one is left out", async () => {
    const prompter = fakePrompter([
      "https://back.example.test",
      "https://front.example.test",
      "Store",
      "",
      "typed-secret",
      "buyer@shop.test",
      "",
      "second@shop.test",
      "",
      "",
      "",
      "",
    ]);

    const answers = await resolveAnswers(input({ prompter }));

    expect(answers.passwords).toEqual({ ADMIN_PASSWORD: "typed-secret" });
    expect(answers.persistPasswords).toEqual(["ADMIN_PASSWORD"]);
    expect(answers.roles).toEqual({ customer: "buyer@shop.test", otherCustomer: "second@shop.test" });
    expect(answers.tracker).toEqual({ kind: "jira", keyPattern: "^PROJ-\\d+$" });
    expect(answers.env).toEqual({
      BACKEND_BASE_URL: "https://back.example.test",
      FRONTEND_BASE_URL: "https://front.example.test",
      STORE_ID: "Store",
      ADMIN_USERNAME: "admin",
      FRONTEND_TEST_ID_ATTRIBUTE: "data-test-id",
    });
    expect(prompter.secretAsked).toHaveLength(3);
  });

  test("an invalid URL flag throws naming --backend-url", async () => {
    await expect(resolveAnswers(input({ values: { "--backend-url": "not a url" } }))).rejects.toThrow(/--backend-url/);
    await expect(resolveAnswers(input({ values: { "--frontend-url": "ftp://x" } }))).rejects.toThrow(/--frontend-url/);
  });

  test("an invalid shell value throws naming the variable", async () => {
    await expect(resolveAnswers(input({ shell: { BACKEND_BASE_URL: "nope" } }))).rejects.toThrow(/BACKEND_BASE_URL/);
  });

  test("an invalid key pattern flag throws naming --key-pattern", async () => {
    await expect(resolveAnswers(input({ values: { "--key-pattern": "([" } }))).rejects.toThrow(/--key-pattern/);
  });

  test("an invalid typed URL is asked again", async () => {
    const prompter = fakePrompter(["localhost", "https://back.example.test"]);

    const answers = await resolveAnswers(
      input({ existingEnv: { ...FILLED_ENV, BACKEND_BASE_URL: "" }, facts: CHANGED_FACTS, prompter }),
    );

    expect(answers.env).toEqual({ BACKEND_BASE_URL: "https://back.example.test" });
    expect(prompter.asked).toHaveLength(2);
  });

  test("three invalid typed answers throw", async () => {
    const prompter = fakePrompter(["a", "b", "c"]);

    await expect(
      resolveAnswers(input({ existingEnv: { ...FILLED_ENV, FRONTEND_BASE_URL: "" }, facts: CHANGED_FACTS, prompter })),
    ).rejects.toThrow(/FRONTEND_BASE_URL/);
  });

  test("a blank typed answer with no default leaves the field to do", async () => {
    const prompter = fakePrompter([""]);

    const answers = await resolveAnswers(
      input({ existingEnv: { ...FILLED_ENV, STORE_ID: "" }, facts: CHANGED_FACTS, prompter }),
    );

    expect(answers.env).toEqual({});
  });

  test("a whitespace-only shell STORE_ID is rejected", async () => {
    await expect(resolveAnswers(input({ shell: { STORE_ID: "   " } }))).rejects.toThrow(/STORE_ID/);
  });

  test("without a prompter and without a value the field is absent", async () => {
    const answers = await resolveAnswers(input());

    expect(answers.env["BACKEND_BASE_URL"]).toBeUndefined();
    expect(answers.env["STORE_ID"]).toBeUndefined();
    expect(answers.passwords).toEqual({});
    expect(answers.roles).toEqual({});
    expect(answers.tracker).toBeUndefined();
  });

  test("the customer question is skipped once roles.customer is not a placeholder", async () => {
    const facts = { ...CHANGED_FACTS, roles: { ...TEMPLATE_FACTS.roles, customer: "buyer@shop.test" } };
    const prompter = fakePrompter(["second@shop.test"]);

    const answers = await resolveAnswers(input({ existingEnv: FILLED_ENV, facts, prompter }));

    expect(prompter.asked).toHaveLength(1);
    expect(prompter.asked[0]).toMatch(/other customer/i);
    expect(answers.roles).toEqual({ otherCustomer: "second@shop.test" });
  });

  test("role and tracker flags apply only while the facts hold the template's values", async () => {
    const values = { "--customer": "buyer@shop.test", "--tracker": "azure-boards", "--key-pattern": "^\\d+$" };

    const fresh = await resolveAnswers(input({ values }));
    expect(fresh.roles).toEqual({ customer: "buyer@shop.test" });
    expect(fresh.tracker).toEqual({ kind: "azure-boards", keyPattern: "^\\d+$" });

    const changed = await resolveAnswers(input({ values, facts: CHANGED_FACTS }));
    expect(changed.roles).toEqual({});
    expect(changed.tracker).toBeUndefined();
  });
});
