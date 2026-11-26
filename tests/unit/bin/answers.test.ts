import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { checkGivenValues, PASSWORD_NAMES, resolveAnswers as resolveUntyped } from "../../../bin/lib/answers.mjs";
import { applyFacts } from "../../../bin/lib/suite-files.mjs";

type Answers = {
  env: Record<string, string>;
  passwords: Record<string, string>;
  persistPasswords: string[];
  roles: { customer?: string; otherCustomer?: string };
  tracker?: { kind: string; keyPattern: string };
  notes: string[];
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

  test("a shell variable is used and the env schema's own default fills the test-id attribute, nothing else", async () => {
    const answers = await resolveAnswers(input({ shell: { STORE_ID: "Shell-store" } }));

    expect(answers.env).toEqual({ STORE_ID: "Shell-store", FRONTEND_TEST_ID_ATTRIBUTE: "data-test-id" });
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
      "jira",
      "",
      "",
    ]);

    const answers = await resolveAnswers(input({ prompter }));

    expect(answers.passwords).toEqual({ ADMIN_PASSWORD: "typed-secret" });
    expect(answers.persistPasswords).toEqual(["ADMIN_PASSWORD"]);
    expect(answers.roles).toEqual({ customer: "buyer@shop.test", otherCustomer: "second@shop.test" });
    expect(answers.tracker).toBeUndefined();
    expect(answers.env).toEqual({
      BACKEND_BASE_URL: "https://back.example.test",
      FRONTEND_BASE_URL: "https://front.example.test",
      STORE_ID: "Store",
      FRONTEND_TEST_ID_ATTRIBUTE: "data-test-id",
    });
    expect(prompter.secretAsked).toHaveLength(3);
  });

  test("an invalid URL flag throws naming --backend-url", async () => {
    await expect(resolveAnswers(input({ values: { "--backend-url": "not a url" } }))).rejects.toThrow(/--backend-url/);
    await expect(resolveAnswers(input({ values: { "--frontend-url": "ftp://x" } }))).rejects.toThrow(/--frontend-url/);
  });

  test("a URL with a path, query, fragment or user name is refused as not an origin, naming the flag", async () => {
    for (const [flag, value] of [
      ["--frontend-url", "https://shop.example.com/en-US/"],
      ["--backend-url", "https://plat.example.com/admin"],
      ["--backend-url", "https://plat.example.com/?a=1"],
      ["--backend-url", "https://plat.example.com/#top"],
      ["--backend-url", "https://user:pw@plat.example.com"],
    ] as const) {
      const given = resolveAnswers(input({ values: { [flag]: value } }));
      await expect(given).rejects.toThrow(flag);
      await expect(given).rejects.toThrow("an origin such as https://host:port");
    }
    const answers = await resolveAnswers(input({ values: { "--backend-url": "https://x.test/" } }));
    expect(answers.env["BACKEND_BASE_URL"]).toBe("https://x.test/");
  });

  test("a valid flag for a key .env already holds is not applied and says so once", async () => {
    const answers = await resolveAnswers(
      input({
        existingEnv: FILLED_ENV,
        facts: CHANGED_FACTS,
        values: {
          "--frontend-url": "https://other.example.test",
          "--backend-url": FILLED_ENV.BACKEND_BASE_URL,
          "--store-id": "Other",
        },
      }),
    );

    expect(answers.env).toEqual({});
    expect(answers.notes).toEqual([
      "Kept FRONTEND_BASE_URL from .env; --frontend-url was not applied (edit .env to change it).",
      "Kept STORE_ID from .env; --store-id was not applied (edit .env to change it).",
    ]);
  });

  test("an invalid shell value throws naming the variable", async () => {
    await expect(resolveAnswers(input({ shell: { BACKEND_BASE_URL: "nope" } }))).rejects.toThrow(/BACKEND_BASE_URL/);
  });

  test("an invalid key pattern flag throws naming --key-pattern", async () => {
    await expect(resolveAnswers(input({ values: { "--tracker": "jira", "--key-pattern": "([" } }))).rejects.toThrow(
      /--key-pattern/,
    );
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

  test("the questions for the URLs, the store and the login carry no default", async () => {
    const prompter = fakePrompter(["", "https://front.example.test", "", "", ""]);

    const asked = await resolveAnswers(
      input({
        existingEnv: {
          ...FILLED_ENV,
          BACKEND_BASE_URL: "",
          FRONTEND_BASE_URL: "",
          STORE_ID: "",
          ADMIN_USERNAME: "",
          FRONTEND_TEST_ID_ATTRIBUTE: "",
        },
        facts: CHANGED_FACTS,
        prompter,
      }),
    );

    expect(prompter.asked).toEqual([
      "Backend (platform) URL",
      "Frontend (storefront) URL",
      "Store id",
      "Administrator login",
      "Test-id attribute of the storefront",
    ]);
    expect(asked.env).toEqual({
      FRONTEND_BASE_URL: "https://front.example.test",
      FRONTEND_TEST_ID_ATTRIBUTE: "data-test-id",
    });
  });

  test("a non-interactive run without flags leaves every stand value out", async () => {
    const answers = await resolveAnswers(input({ values: { "--store-id": "Flag-store" } }));

    expect(answers.env["BACKEND_BASE_URL"]).toBeUndefined();
    expect(answers.env["FRONTEND_BASE_URL"]).toBeUndefined();
    expect(answers.env["ADMIN_USERNAME"]).toBeUndefined();
    expect(answers.env["STORE_ID"]).toBe("Flag-store");
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
  test("an answered tracker is written, and the next run asks nothing about it", async () => {
    const first = fakePrompter(["jira", "^ABC-\\d+$"]);
    const answers = await resolveAnswers(
      input({ existingEnv: FILLED_ENV, facts: { ...CHANGED_FACTS, tracker: TEMPLATE_FACTS.tracker }, prompter: first }),
    );
    expect(answers.tracker).toEqual({ kind: "jira", keyPattern: "^ABC-\\d+$" });

    const second = fakePrompter([]);
    const facts = applyFacts({ ...CHANGED_FACTS, tracker: TEMPLATE_FACTS.tracker }, answers, "admin");
    const again = await resolveAnswers(input({ existingEnv: FILLED_ENV, facts, prompter: second }));

    expect(second.asked).toEqual([]);
    expect(again.tracker).toBeUndefined();
  });

  test("the template's PROJ pattern is never offered: a blank jira pattern leaves the tracker to do", async () => {
    const prompter = fakePrompter(["jira", ""]);

    const answers = await resolveAnswers(
      input({ existingEnv: FILLED_ENV, facts: { ...CHANGED_FACTS, tracker: TEMPLATE_FACTS.tracker }, prompter }),
    );

    expect(answers.tracker).toBeUndefined();
    expect(prompter.asked[1]).not.toContain("PROJ");
  });

  test("the tracker question has no default, says what it wants, and shows an example key for the kind", async () => {
    const facts = { ...CHANGED_FACTS, tracker: TEMPLATE_FACTS.tracker };
    const jira = fakePrompter(["jira", "^VCST-\\d+$"]);
    const boards = fakePrompter(["azure-boards", ""]);

    const answered = await resolveAnswers(input({ existingEnv: FILLED_ENV, facts, prompter: jira }));
    const defaulted = await resolveAnswers(input({ existingEnv: FILLED_ENV, facts, prompter: boards }));

    expect(jira.asked).toEqual([
      "Where are your tickets tracked? (jira, azure-boards or another tracker's name)",
      "Ticket key pattern, such as ^VCST-\\d+$ for keys like VCST-123",
    ]);
    expect(boards.asked[1]).toBe("Ticket key pattern, such as ^\\d+$ for keys like 1234");
    expect(answered.tracker).toEqual({ kind: "jira", keyPattern: "^VCST-\\d+$" });
    expect(defaulted.tracker).toEqual({ kind: "azure-boards", keyPattern: "^\\d+$" });
  });

  test("a blank tracker kind is asked again, and refused after the attempts", async () => {
    const facts = { ...CHANGED_FACTS, tracker: TEMPLATE_FACTS.tracker };
    const question = "Where are your tickets tracked? (jira, azure-boards or another tracker's name)";
    const prompter = fakePrompter(["", "  ", "jira", ""]);

    const answers = await resolveAnswers(input({ existingEnv: FILLED_ENV, facts, prompter }));

    expect(answers.tracker).toBeUndefined();
    expect(prompter.asked.slice(0, 3)).toEqual([
      question,
      `${question} (must not be blank)`,
      `${question} (must not be blank)`,
    ]);
    const refused = resolveAnswers(input({ existingEnv: FILLED_ENV, facts, prompter: fakePrompter(["", "", ""]) }));
    await expect(refused).rejects.toThrow(/tracker kind must not be blank; asked 3 times/);
  });

  test("without a prompter the tracker is left to do unless --tracker is given", async () => {
    const none = await resolveAnswers(input({ existingEnv: FILLED_ENV }));
    const patternOnly = await resolveAnswers(
      input({ existingEnv: FILLED_ENV, values: { "--key-pattern": "^A-\\d+$" } }),
    );
    const kindOnly = await resolveAnswers(input({ existingEnv: FILLED_ENV, values: { "--tracker": "jira" } }));
    const both = await resolveAnswers(
      input({ existingEnv: FILLED_ENV, values: { "--tracker": "jira", "--key-pattern": "^A-\\d+$" } }),
    );

    expect(none.tracker).toBeUndefined();
    expect(none.notes).toEqual([]);
    expect(patternOnly.tracker).toBeUndefined();
    expect(patternOnly.notes).toEqual(["Ignored --key-pattern: the tracker kind is not given; pass --tracker too."]);
    expect(kindOnly.tracker).toBeUndefined();
    expect(both.tracker).toEqual({ kind: "jira", keyPattern: "^A-\\d+$" });
  });

  test("a typed password that .env cannot hold is asked again", async () => {
    const prompter = fakePrompter(["a'b\"c`d #e", "good"]);

    const answers = await resolveAnswers(
      input({ existingEnv: { ...FILLED_ENV, ADMIN_PASSWORD: "" }, facts: CHANGED_FACTS, prompter }),
    );

    expect(answers.passwords).toEqual({ ADMIN_PASSWORD: "good" });
    expect(prompter.secretAsked).toHaveLength(2);
  });

  test("a shell password .env cannot hold throws only when it is to be saved, naming the variable alone", async () => {
    const shell = { ADMIN_PASSWORD: "a'b\"c`d #e" };

    const kept = await resolveAnswers(input({ shell }));
    expect(kept.passwords).toEqual(shell);

    const saving = resolveAnswers(input({ shell, switches: new Set(["--save-passwords"]) }));
    await expect(saving).rejects.toThrow(/^ADMIN_PASSWORD /);
    await expect(saving).rejects.not.toThrow(/a'b/);
  });
});

test.describe("checkGivenValues", () => {
  const switches = new Set<string>();

  test("refuses an invalid flag or shell value before anything is asked or written", () => {
    expect(() => checkGivenValues({ values: { "--backend-url": "localhost:8090" }, switches, shell: {} })).toThrow(
      /--backend-url/,
    );
    expect(() => checkGivenValues({ values: {}, switches, shell: { STORE_ID: "   " } })).toThrow(/STORE_ID/);
    expect(() => checkGivenValues({ values: { "--key-pattern": "(" }, switches, shell: {} })).toThrow(/--key-pattern/);
    expect(() =>
      checkGivenValues({
        values: {},
        switches: new Set(["--save-passwords"]),
        shell: { ADMIN_PASSWORD: "a'b\"c`d\ne" },
      }),
    ).toThrow(/^ADMIN_PASSWORD /);
  });

  test("accepts valid values and a shell password that is not to be saved", () => {
    expect(() =>
      checkGivenValues({
        values: { "--backend-url": "https://back.example.test", "--key-pattern": "^A-d+$", "--customer": "a@b.test" },
        switches,
        shell: { ADMIN_PASSWORD: "a'b\"c`d\ne" },
      }),
    ).not.toThrow();
  });
});
