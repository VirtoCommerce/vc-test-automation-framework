import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { placeholderProblems } from "../../../.claude/checks/facts-consistency.mts";
import { parseProjectFacts } from "../../../.claude/checks/project-facts.mts";
import { checkGivenValues, PASSWORD_NAMES, resolveAnswers as resolveUntyped } from "../../../bin/lib/answers.mjs";
import { applyFacts } from "../../../bin/lib/suite-files.mjs";

type Answers = {
  env: Record<string, string>;
  passwords: Record<string, string>;
  persistPasswords: string[];
  roles: { customer?: string; otherCustomer?: string | null };
  tracker?: { kind: string; keyPattern: string };
  docs?: { name: string; route: string; where: string };
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
  roleFor: { admin: "administrator", customer: "customer", otherCustomer: "other customer" },
  passwordFor: {
    administrator: "ADMIN_PASSWORD",
    customer: "CUSTOMER_PASSWORD",
    "other customer": "OTHER_CUSTOMER_PASSWORD",
  },
  tracker: { kind: "azure-boards", keyPattern: "^\\d+$", routes: ["paste"] },
  docSources: [{ name: "Team wiki", route: "paste", where: "the wiki page" }],
};

const CUSTOMER_QUESTION = "Customer accounts already on the stand? Customer login (email; empty if none)";
const OTHER_CUSTOMER_QUESTION = "Other customer login (email of a customer of another organization; empty if none)";
const TEMPLATE_DOC_SOURCE = TEMPLATE_FACTS.docSources[0];

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

  test("a fresh interactive run asks the five stand questions, then the optional customer, and nothing else", async () => {
    const prompter = fakePrompter([
      "https://back.example.test",
      "https://front.example.test",
      "Store",
      "root",
      "typed-secret",
      "",
    ]);

    const answers = await resolveAnswers(input({ prompter }));

    expect(prompter.asked).toEqual([
      "Backend (platform) URL",
      "Frontend URL",
      "Store id",
      "Administrator login",
      CUSTOMER_QUESTION,
    ]);
    expect(prompter.secretAsked).toEqual(["Administrator password"]);
    expect(answers.passwords).toEqual({ ADMIN_PASSWORD: "typed-secret" });
    expect(answers.persistPasswords).toEqual(["ADMIN_PASSWORD"]);
    expect(answers.roles).toEqual({});
    expect(answers.tracker).toBeUndefined();
    expect(answers.docs).toBeUndefined();
    expect(answers.env).toEqual({
      BACKEND_BASE_URL: "https://back.example.test",
      FRONTEND_BASE_URL: "https://front.example.test",
      STORE_ID: "Store",
      ADMIN_USERNAME: "root",
      FRONTEND_TEST_ID_ATTRIBUTE: "data-test-id",
    });
    const facts = parseProjectFacts(applyFacts(TEMPLATE_FACTS, answers, "root"));
    expect(facts.roleFor).toEqual({ admin: "administrator" });
    expect(placeholderProblems(facts)).toEqual([]);
  });

  test("the questions for the URLs, the store and the login carry no default, and the test-id attribute is not asked", async () => {
    const prompter = fakePrompter(["", "https://front.example.test", "", ""]);

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

    expect(prompter.asked).toEqual(["Backend (platform) URL", "Frontend URL", "Store id", "Administrator login"]);
    expect(asked.env).toEqual({
      FRONTEND_BASE_URL: "https://front.example.test",
      FRONTEND_TEST_ID_ATTRIBUTE: "data-test-id",
    });
  });

  test("answered customers are asked their passwords and give facts that parse and hold no template account", async () => {
    const env = { ...FILLED_ENV, CUSTOMER_PASSWORD: "", OTHER_CUSTOMER_PASSWORD: "" };
    const prompter = fakePrompter(["buyer@shop.test", "c-secret", "second@shop.test", "o-secret"]);

    const answers = await resolveAnswers(input({ existingEnv: env, prompter }));
    const facts = parseProjectFacts(applyFacts(TEMPLATE_FACTS, answers, "admin"));

    expect(prompter.asked).toEqual([CUSTOMER_QUESTION, OTHER_CUSTOMER_QUESTION]);
    expect(prompter.secretAsked).toEqual(["Customer password", "Other customer password"]);
    expect(answers.passwords).toEqual({ CUSTOMER_PASSWORD: "c-secret", OTHER_CUSTOMER_PASSWORD: "o-secret" });
    expect(answers.persistPasswords).toEqual(["CUSTOMER_PASSWORD", "OTHER_CUSTOMER_PASSWORD"]);
    expect(facts.roles).toEqual({
      administrator: "admin",
      customer: "buyer@shop.test",
      "other customer": "second@shop.test",
    });
    expect(facts.roleFor).toEqual({ admin: "administrator", customer: "customer", otherCustomer: "other customer" });
    expect(facts.passwordFor).toEqual({
      administrator: "ADMIN_PASSWORD",
      customer: "CUSTOMER_PASSWORD",
      "other customer": "OTHER_CUSTOMER_PASSWORD",
    });
    expect(placeholderProblems(facts)).toEqual([]);
  });

  test("an empty customer asks nothing more, and an empty other customer adds only the customer", async () => {
    const env = { ...FILLED_ENV, CUSTOMER_PASSWORD: "", OTHER_CUSTOMER_PASSWORD: "" };
    const none = fakePrompter([""]);
    const one = fakePrompter(["buyer@shop.test", "", ""]);

    const without = await resolveAnswers(input({ existingEnv: env, prompter: none }));
    const only = await resolveAnswers(input({ existingEnv: env, prompter: one }));

    expect(none.asked).toEqual([CUSTOMER_QUESTION]);
    expect(none.secretAsked).toEqual([]);
    expect(without.roles).toEqual({});
    expect(one.asked).toEqual([CUSTOMER_QUESTION, OTHER_CUSTOMER_QUESTION]);
    expect(one.secretAsked).toEqual(["Customer password"]);
    const facts = parseProjectFacts(applyFacts(TEMPLATE_FACTS, only, "admin"));
    expect(facts.roles).toEqual({ administrator: "admin", customer: "buyer@shop.test" });
    expect(facts.roleFor).toEqual({ admin: "administrator", customer: "customer" });
    expect(facts.passwordFor).toEqual({ administrator: "ADMIN_PASSWORD", customer: "CUSTOMER_PASSWORD" });
  });

  test("a re-run asks nothing once a customer role exists, and asks the customer again only while none does", async () => {
    const first = await resolveAnswers(
      input({ existingEnv: FILLED_ENV, prompter: fakePrompter(["buyer@shop.test", ""]) }),
    );
    const facts = applyFacts(TEMPLATE_FACTS, first, "admin");
    const second = fakePrompter([]);
    const withoutCustomer = fakePrompter([""]);

    const again = await resolveAnswers(input({ existingEnv: FILLED_ENV, facts, prompter: second }));
    const quiet = await resolveAnswers(input({ existingEnv: FILLED_ENV }));
    await resolveAnswers(input({ existingEnv: FILLED_ENV, prompter: withoutCustomer }));

    expect(second.asked).toEqual([]);
    expect(second.secretAsked).toEqual([]);
    expect(again.roles).toEqual({});
    expect(again.passwords).toEqual({});
    expect(quiet.roles).toEqual({});
    expect(withoutCustomer.asked).toEqual([CUSTOMER_QUESTION]);
  });

  test("--customer and --other-customer add the roles without asking their logins; the passwords come from the shell", async () => {
    const values = { "--customer": "buyer@shop.test", "--other-customer": "second@shop.test" };
    const shell = { CUSTOMER_PASSWORD: "c-shell" };

    const answers = await resolveAnswers(input({ values, shell }));
    const facts = parseProjectFacts(applyFacts(TEMPLATE_FACTS, answers, "admin"));

    expect(answers.roles).toEqual({ customer: "buyer@shop.test", otherCustomer: "second@shop.test" });
    expect(answers.passwords).toEqual({ CUSTOMER_PASSWORD: "c-shell" });
    expect(answers.persistPasswords).toEqual([]);
    expect(facts.roleFor).toEqual({ admin: "administrator", customer: "customer", otherCustomer: "other customer" });
  });

  test("--other-customer without a customer is refused", async () => {
    const refused = resolveAnswers(input({ values: { "--other-customer": "second@shop.test" } }));

    await expect(refused).rejects.toThrow(/^--other-customer needs --customer/);
  });

  test("a customer flag keeps a customer the facts already hold, and says so", async () => {
    const answers = await resolveAnswers(
      input({ existingEnv: FILLED_ENV, facts: CHANGED_FACTS, values: { "--customer": "new@shop.test" } }),
    );

    expect(answers.roles).toEqual({});
    expect(answers.notes).toEqual([
      'Kept roles["customer"] from .qa/project.json; --customer was not applied (edit .qa/project.json to change it).',
    ]);
  });

  test("writes the customers' logins to the roles roleFor names", async () => {
    const facts = {
      ...TEMPLATE_FACTS,
      roles: { administrator: "admin", buyer: "buyer@your-company.test", rival: "rival@your-company.test" },
      roleFor: { admin: "administrator", customer: "buyer", otherCustomer: "rival" },
      passwordFor: { administrator: "ADMIN_PASSWORD", buyer: "CUSTOMER_PASSWORD", rival: "OTHER_CUSTOMER_PASSWORD" },
    };
    const answered = await resolveAnswers(
      input({
        existingEnv: FILLED_ENV,
        facts,
        values: { "--customer": "b@shop.test", "--other-customer": "r@shop.test" },
      }),
    );

    expect(parseProjectFacts(applyFacts(facts, answered, "admin")).roles).toEqual({
      administrator: "admin",
      buyer: "b@shop.test",
      rival: "r@shop.test",
    });
  });

  test("the tracker is never asked, and --tracker with --key-pattern writes it to facts that have none", async () => {
    const prompter = fakePrompter([""]);
    const asked = await resolveAnswers(input({ existingEnv: FILLED_ENV, prompter }));
    const flagged = await resolveAnswers(
      input({ existingEnv: FILLED_ENV, values: { "--tracker": "jira", "--key-pattern": "^ABC-\\d+$" } }),
    );
    const boards = await resolveAnswers(input({ existingEnv: FILLED_ENV, values: { "--tracker": "azure boards" } }));
    const facts = parseProjectFacts(applyFacts(TEMPLATE_FACTS, flagged, "admin"));

    expect(prompter.asked).toEqual([CUSTOMER_QUESTION]);
    expect(asked.tracker).toBeUndefined();
    expect(flagged.tracker).toEqual({ kind: "jira", keyPattern: "^ABC-\\d+$" });
    expect(facts.tracker).toEqual({ kind: "jira", keyPattern: "^ABC-\\d+$", routes: ["paste"] });
    expect(boards.tracker).toEqual({ kind: "azure-boards", keyPattern: "^\\d+$" });
  });

  test("--tracker is not applied over a tracker the facts already hold, and a jira tracker needs --key-pattern", async () => {
    const kept = await resolveAnswers(
      input({
        existingEnv: FILLED_ENV,
        facts: CHANGED_FACTS,
        values: { "--tracker": "jira", "--key-pattern": "^A-\\d+$" },
      }),
    );
    const kindOnly = await resolveAnswers(input({ existingEnv: FILLED_ENV, values: { "--tracker": "jira" } }));

    expect(kept.tracker).toBeUndefined();
    expect(kept.notes).toEqual([
      "Kept tracker from .qa/project.json; --tracker and --key-pattern were not applied (edit .qa/project.json to change it).",
    ]);
    expect(kindOnly.tracker).toBeUndefined();
    expect(kindOnly.notes).toEqual(["Ignored --tracker: a jira tracker needs --key-pattern too."]);
  });

  test("--docs is mapped by its shape: URL, mcp server, or text", async () => {
    const expected = [
      ["https://wiki.example.test/docs", { route: "api", where: "https://wiki.example.test/docs" }],
      ["  http://wiki.example.test  ", { route: "api", where: "http://wiki.example.test" }],
      ["mcp:team-wiki", { route: "mcp", where: "team-wiki" }],
      ["mcp: team wiki ", { route: "mcp", where: "team wiki" }],
      ["ask the product owner for the spec", { route: "paste", where: "ask the product owner for the spec" }],
    ] as const;

    for (const [given, source] of expected) {
      const answers = await resolveAnswers(input({ existingEnv: FILLED_ENV, values: { "--docs": given } }));

      expect(answers.docs).toEqual({ name: "Project documentation", ...source });
    }
  });

  test("the documentation and the test-id attribute are never asked", async () => {
    const prompter = fakePrompter([""]);

    const answers = await resolveAnswers(
      input({ existingEnv: { ...FILLED_ENV, FRONTEND_TEST_ID_ATTRIBUTE: "" }, prompter }),
    );

    expect(prompter.asked).toEqual([CUSTOMER_QUESTION]);
    expect(answers.docs).toBeUndefined();
    expect(answers.env).toEqual({ FRONTEND_TEST_ID_ATTRIBUTE: "data-test-id" });
  });

  test("a --test-id-attribute flag is written", async () => {
    const answers = await resolveAnswers(
      input({
        existingEnv: { ...FILLED_ENV, FRONTEND_TEST_ID_ATTRIBUTE: "" },
        values: { "--test-id-attribute": "data-qa" },
      }),
    );

    expect(answers.env).toEqual({ FRONTEND_TEST_ID_ATTRIBUTE: "data-qa" });
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

  test("role and tracker flags apply only while the facts hold the template's values", async () => {
    const values = { "--customer": "buyer@shop.test", "--tracker": "azure-boards", "--key-pattern": "^\\d+$" };

    const fresh = await resolveAnswers(input({ values }));
    expect(fresh.roles).toEqual({ customer: "buyer@shop.test" });
    expect(fresh.tracker).toEqual({ kind: "azure-boards", keyPattern: "^\\d+$" });

    const changed = await resolveAnswers(input({ values, facts: CHANGED_FACTS }));
    expect(changed.roles).toEqual({});
    expect(changed.tracker).toBeUndefined();
  });
  test("without a prompter the tracker is left to do unless --tracker is given", async () => {
    const none = await resolveAnswers(input({ existingEnv: FILLED_ENV }));
    const patternOnly = await resolveAnswers(
      input({ existingEnv: FILLED_ENV, values: { "--key-pattern": "^AB-\\d+$" } }),
    );
    const kindOnly = await resolveAnswers(input({ existingEnv: FILLED_ENV, values: { "--tracker": "jira" } }));
    const both = await resolveAnswers(
      input({ existingEnv: FILLED_ENV, values: { "--tracker": "jira", "--key-pattern": "^AB-\\d+$" } }),
    );

    expect(none.tracker).toBeUndefined();
    expect(none.notes).toEqual([]);
    expect(patternOnly.tracker).toBeUndefined();
    expect(patternOnly.notes).toEqual(["Ignored --key-pattern: the tracker kind is not given; pass --tracker too."]);
    expect(kindOnly.tracker).toBeUndefined();
    expect(both.tracker).toEqual({ kind: "jira", keyPattern: "^AB-\\d+$" });
  });

  test("the project's documentation is written first and the template's entry stays after it", async () => {
    const facts = { ...CHANGED_FACTS, docSources: TEMPLATE_FACTS.docSources };
    const answers = await resolveAnswers(input({ existingEnv: FILLED_ENV, facts, values: { "--docs": "mcp:wiki" } }));

    const written = applyFacts(facts, answers, "admin");

    expect(written["docSources"]).toEqual([
      { name: "Project documentation", route: "mcp", where: "wiki" },
      TEMPLATE_DOC_SOURCE,
    ]);
    expect(facts.docSources).toEqual([TEMPLATE_DOC_SOURCE]);
  });

  test("--docs applies while docSources is the template's and is reported as not applied once it changed", async () => {
    const values = { "--docs": "https://wiki.example.test" };

    const fresh = await resolveAnswers(input({ existingEnv: FILLED_ENV, values }));
    const changed = await resolveAnswers(input({ existingEnv: FILLED_ENV, facts: CHANGED_FACTS, values }));

    expect(fresh.docs).toEqual({ name: "Project documentation", route: "api", where: "https://wiki.example.test" });
    expect(fresh.notes).toEqual([]);
    expect(changed.docs).toBeUndefined();
    expect(changed.notes).toEqual([
      "Kept docSources from .qa/project.json; --docs was not applied (edit .qa/project.json to change it).",
    ]);
  });

  test("a non-interactive run without --docs leaves docSources as the template", async () => {
    const answers = await resolveAnswers(input({ existingEnv: FILLED_ENV }));

    expect(answers.docs).toBeUndefined();
    expect(applyFacts(TEMPLATE_FACTS, answers, "admin")["docSources"]).toEqual(TEMPLATE_FACTS.docSources);
  });

  test("an invalid --docs throws naming the flag", async () => {
    const mcp = resolveAnswers(input({ values: { "--docs": "mcp:   " } }));
    const url = resolveAnswers(input({ values: { "--docs": "https://" } }));

    await expect(mcp).rejects.toThrow(/--docs must name the MCP server after mcp:/);
    await expect(url).rejects.toThrow(/--docs must be an http or https URL/);
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
    expect(() => checkGivenValues({ values: { "--docs": "mcp:" }, switches, shell: {} })).toThrow(/--docs/);
    expect(() => checkGivenValues({ values: { "--docs": "https://" }, switches, shell: {} })).toThrow(/--docs/);
    expect(() => checkGivenValues({ values: { "--docs": "http//wiki.example.test" }, switches, shell: {} })).toThrow(
      /--docs/,
    );
    expect(() => checkGivenValues({ values: { "--docs": "   " }, switches, shell: {} })).toThrow(/--docs/);
    expect(() => checkGivenValues({ values: { "--tracker": "jira, azure-boards" }, switches, shell: {} })).toThrow(
      /^--tracker one tracker only for now \(enter the main one\)/,
    );
    expect(() =>
      checkGivenValues({ values: { "--tracker": "azure-boards", "--key-pattern": "SHOP" }, switches, shell: {} }),
    ).toThrow(/^--key-pattern must match an azure-boards work item id/);
    expect(() =>
      checkGivenValues({ values: { "--tracker": "jira", "--key-pattern": "^SHOP$" }, switches, shell: {} }),
    ).toThrow(/^--key-pattern must match a jira key/);
    expect(() => checkGivenValues({ values: { "--key-pattern": "^AB#d+$" }, switches, shell: {} })).toThrow(
      /^--key-pattern has "d\+" with no backslash before it/,
    );
    expect(() =>
      checkGivenValues({
        values: {},
        switches: new Set(["--save-passwords"]),
        shell: { ADMIN_PASSWORD: "a'b\"c`d\ne" },
      }),
    ).toThrow(/^ADMIN_PASSWORD /);
  });

  test("accepts --frontend-sign-in oauth or cookie and refuses anything else", () => {
    for (const signIn of ["oauth", "cookie"]) {
      expect(() => checkGivenValues({ values: { "--frontend-sign-in": signIn }, switches, shell: {} })).not.toThrow();
    }
    expect(() => checkGivenValues({ values: { "--frontend-sign-in": "token" }, switches, shell: {} })).toThrow(
      /^--frontend-sign-in must be oauth or cookie: token/,
    );
  });

  test("accepts a documentation URL, an mcp server and plain text", () => {
    for (const docs of ["https://wiki.example.test/a?b=1", "mcp:wiki", "ask the product owner", "httpd handbook"]) {
      expect(() => checkGivenValues({ values: { "--docs": docs }, switches, shell: {} })).not.toThrow();
    }
  });

  test("accepts valid values and a shell password that is not to be saved", () => {
    expect(() =>
      checkGivenValues({
        values: {
          "--backend-url": "https://back.example.test",
          "--key-pattern": "^AB-\\d+$",
          "--customer": "a@b.test",
        },
        switches,
        shell: { ADMIN_PASSWORD: "a'b\"c`d\ne" },
      }),
    ).not.toThrow();
  });
});

test.describe("parseProjectFacts of the template", () => {
  test("accepts the facts without a tracker, a customer or another customer", () => {
    const facts = parseProjectFacts(TEMPLATE_FACTS);

    expect(facts.tracker).toBeUndefined();
    expect(facts.roleFor).toEqual({ admin: "administrator" });
    expect(placeholderProblems(facts)).toEqual([]);
  });

  test("still refuses a tracker that is present and wrong", () => {
    expect(() => parseProjectFacts({ ...TEMPLATE_FACTS, tracker: { kind: "jira" } })).toThrow(
      /^project.json: tracker.keyPattern is missing/,
    );
    expect(() =>
      parseProjectFacts({ ...TEMPLATE_FACTS, tracker: { kind: "jira", keyPattern: "^ABC-\\d+$", routes: [] } }),
    ).toThrow(/^project.json: tracker.routes is empty/);
  });

  test("refuses another customer without a customer, and the customer and the other as one role or account", () => {
    const roles = { administrator: "admin", buyer: "b@shop.test", rival: "B@shop.test" };

    expect(() =>
      parseProjectFacts({ ...TEMPLATE_FACTS, roles, roleFor: { admin: "administrator", otherCustomer: "rival" } }),
    ).toThrow(/^project.json: roleFor.otherCustomer needs roleFor.customer$/);
    expect(() =>
      parseProjectFacts({ ...TEMPLATE_FACTS, roles, roleFor: { customer: "buyer", otherCustomer: "buyer" } }),
    ).toThrow(/is the same role as roleFor.customer/);
    expect(() =>
      parseProjectFacts({ ...TEMPLATE_FACTS, roles, roleFor: { customer: "buyer", otherCustomer: "rival" } }),
    ).toThrow(/is the same account as roleFor.customer/);
  });
});
