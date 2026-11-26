import { envValueProblem } from "./suite-files.mjs";

export const PASSWORD_NAMES = ["ADMIN_PASSWORD", "CUSTOMER_PASSWORD", "OTHER_CUSTOMER_PASSWORD"];

const ATTEMPTS = 3;
const PLACEHOLDER_DOMAIN = "@your-company.test";
const TEMPLATE_TRACKER = { kind: "jira", keyPattern: "^PROJ-\\d+$" };
const KEY_PATTERN_FOR = { "azure-boards": "^\\d+$" };
const KEY_EXAMPLE = { pattern: "^ABC-\\d+$", key: "ABC-123" };
const KEY_EXAMPLE_FOR = { "azure-boards": { pattern: "^\\d+$", key: "1234" } };
const TEMPLATE_DOC_SOURCES = [
  { name: "Virto Commerce documentation", route: "api", where: "https://docs.virtocommerce.org" },
];
const DOC_SOURCE_NAME = "Project documentation";
const DOCS_QUESTION =
  "Where is your project's own documentation? (a URL, mcp:<server name>, or what to ask a person for; empty to skip)";
const URL_PREFIX = /^https?(?::|\/\/)/i;
const MCP_PREFIX = /^mcp:/i;

function keyPatternLabel(kind) {
  const example = KEY_EXAMPLE_FOR[kind] ?? KEY_EXAMPLE;
  return `Ticket key pattern, such as ${example.pattern} for keys like ${example.key}`;
}

function urlProblem(value) {
  const parsed = URL.parse(value);
  if (parsed === null || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    return "must be an http or https URL";
  }
  const origin =
    parsed.pathname === "/" &&
    parsed.search === "" &&
    parsed.hash === "" &&
    parsed.username === "" &&
    parsed.password === "";
  return origin
    ? undefined
    : "must be an origin such as https://host:port, without a path, query, fragment or user name";
}

function blankProblem(value) {
  return value.trim() === "" ? "must not be blank" : undefined;
}

function patternProblem(value) {
  try {
    new RegExp(value);
    return undefined;
  } catch {
    return "must be a valid regular expression";
  }
}

function docsProblem(value) {
  const text = value.trim();
  if (text === "") {
    return "must not be blank";
  }
  if (MCP_PREFIX.test(text)) {
    return text.replace(MCP_PREFIX, "").trim() === "" ? "must name the MCP server after mcp:" : undefined;
  }
  if (URL_PREFIX.test(text)) {
    const parsed = URL.parse(text);
    return parsed !== null && (parsed.protocol === "http:" || parsed.protocol === "https:")
      ? undefined
      : "must be an http or https URL";
  }
  return undefined;
}

function docSourceFor(value) {
  const text = value.trim();
  if (MCP_PREFIX.test(text)) {
    return { name: DOC_SOURCE_NAME, route: "mcp", where: text.replace(MCP_PREFIX, "").trim() };
  }
  if (URL_PREFIX.test(text)) {
    return { name: DOC_SOURCE_NAME, route: "api", where: text };
  }
  return { name: DOC_SOURCE_NAME, route: "paste", where: text };
}

const SETTINGS = [
  { name: "BACKEND_BASE_URL", flag: "--backend-url", label: "Backend (platform) URL", check: urlProblem },
  { name: "FRONTEND_BASE_URL", flag: "--frontend-url", label: "Frontend (storefront) URL", check: urlProblem },
  { name: "STORE_ID", flag: "--store-id", label: "Store id", check: blankProblem },
  {
    name: "ADMIN_USERNAME",
    flag: "--admin-login",
    label: "Administrator login",
    check: blankProblem,
  },
];

const TEST_ID = {
  name: "FRONTEND_TEST_ID_ATTRIBUTE",
  flag: "--test-id-attribute",
  label: "Test-id attribute of the storefront",
  check: blankProblem,
  fallback: "data-test-id",
};

function given(value) {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function filled(value) {
  return typeof value === "string" && value.trim() !== "";
}

function givenValue({ flag, shellName, check }, input) {
  const fromFlag = flag === undefined ? undefined : given(input.values[flag]);
  if (fromFlag !== undefined) {
    const problem = check(fromFlag.trim());
    if (problem !== undefined) {
      throw new Error(`${flag} ${problem}: ${fromFlag}`);
    }
    return fromFlag.trim();
  }
  const fromShell = shellName === undefined ? undefined : given(input.shell[shellName]);
  if (fromShell !== undefined) {
    const problem = check(fromShell.trim());
    if (problem !== undefined) {
      throw new Error(`${shellName} ${problem}: ${fromShell}`);
    }
    return fromShell.trim();
  }
  return undefined;
}

async function resolveField(field, input) {
  const { name, label, check, fallback, required } = field;
  const fromGiven = givenValue(field, input);
  if (fromGiven !== undefined) {
    return fromGiven;
  }
  if (input.prompter === undefined) {
    return fallback;
  }
  let problem;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const question = problem === undefined ? label : `${label} (${problem})`;
    const reply = (await input.prompter.ask(question, fallback)).trim();
    if (reply === "" && required !== true) {
      return fallback;
    }
    problem = reply === "" ? blankProblem(reply) : check(reply);
    if (problem === undefined) {
      return reply;
    }
  }
  throw new Error(`${name} ${problem}; asked ${ATTEMPTS} times`);
}

async function resolvePassword(name, label, input, answers) {
  if (filled(input.existingEnv[name])) {
    return;
  }
  const fromShell = given(input.shell[name]);
  if (fromShell !== undefined) {
    answers.passwords[name] = fromShell;
    if (input.switches.has("--save-passwords")) {
      const problem = envValueProblem(fromShell);
      if (problem !== undefined) {
        throw new Error(`${name} ${problem}`);
      }
      answers.persistPasswords.push(name);
    }
    return;
  }
  if (input.prompter === undefined) {
    return;
  }
  let problem;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const typed = await input.prompter.askSecret(problem === undefined ? label : `${label} (${problem})`);
    if (typed === "") {
      return;
    }
    problem = envValueProblem(typed);
    if (problem === undefined) {
      answers.passwords[name] = typed;
      answers.persistPasswords.push(name);
      return;
    }
  }
  throw new Error(`${name} ${problem}; asked ${ATTEMPTS} times`);
}

function settingCheck(field) {
  return (value) => field.check(value) ?? envValueProblem(value);
}

export function checkGivenValues(input) {
  for (const field of [...SETTINGS, TEST_ID]) {
    givenValue({ ...field, check: settingCheck(field), shellName: field.name }, input);
  }
  for (const flag of ["--customer", "--other-customer", "--tracker"]) {
    givenValue({ flag, check: blankProblem }, input);
  }
  givenValue({ flag: "--key-pattern", check: patternProblem }, input);
  givenValue({ flag: "--docs", check: docsProblem }, input);
  if (input.switches.has("--save-passwords")) {
    for (const name of PASSWORD_NAMES) {
      const fromShell = given(input.shell[name]);
      const problem = fromShell === undefined ? undefined : envValueProblem(fromShell);
      if (problem !== undefined) {
        throw new Error(`${name} ${problem}`);
      }
    }
  }
}

async function resolveSetting(field, input, answers) {
  const held = input.existingEnv[field.name];
  if (filled(held)) {
    const fromFlag = given(input.values[field.flag]);
    if (fromFlag !== undefined && fromFlag.trim() !== held.trim()) {
      answers.notes.push(`Kept ${field.name} from .env; ${field.flag} was not applied (edit .env to change it).`);
    }
    return;
  }
  const check = settingCheck(field);
  const value = await resolveField({ ...field, check, shellName: field.name }, input);
  if (value !== undefined) {
    answers.env[field.name] = value;
  }
}

function isPlaceholder(login) {
  return typeof login === "string" && login.endsWith(PLACEHOLDER_DOMAIN);
}

function roleOf(facts, role) {
  const roles = facts["roles"];
  return roles !== null && typeof roles === "object" ? roles[role] : undefined;
}

async function resolveRole(role, flag, label, input) {
  if (!isPlaceholder(roleOf(input.facts, role))) {
    return undefined;
  }
  return resolveField({ name: `${role} login`, flag, label, check: blankProblem }, input);
}

function isTemplateTracker(facts) {
  const tracker = facts["tracker"];
  return (
    tracker !== null &&
    typeof tracker === "object" &&
    tracker.kind === TEMPLATE_TRACKER.kind &&
    tracker.keyPattern === TEMPLATE_TRACKER.keyPattern
  );
}

async function resolveTracker(input, answers) {
  if (!isTemplateTracker(input.facts)) {
    return undefined;
  }
  const flagged = given(input.values["--tracker"]) !== undefined || given(input.values["--key-pattern"]) !== undefined;
  if (!flagged && input.prompter === undefined) {
    return undefined;
  }
  const kind = await resolveField(
    {
      name: "tracker kind",
      flag: "--tracker",
      label: "Where are your tickets tracked? (jira, azure-boards or another tracker's name)",
      check: blankProblem,
      required: true,
    },
    input,
  );
  if (kind === undefined) {
    answers.notes.push("Ignored --key-pattern: the tracker kind is not given; pass --tracker too.");
    return undefined;
  }
  const keyPattern = await resolveField(
    {
      name: "ticket-key pattern",
      flag: "--key-pattern",
      label: keyPatternLabel(kind),
      check: patternProblem,
      fallback: KEY_PATTERN_FOR[kind],
    },
    input,
  );
  return keyPattern === undefined ? undefined : { kind, keyPattern };
}

function isTemplateDocSources(facts) {
  const sources = facts["docSources"];
  return (
    Array.isArray(sources) &&
    sources.length === TEMPLATE_DOC_SOURCES.length &&
    sources.every((source, index) => {
      const template = TEMPLATE_DOC_SOURCES[index];
      return (
        source !== null &&
        typeof source === "object" &&
        source.name === template.name &&
        source.route === template.route &&
        source.where === template.where
      );
    })
  );
}

async function resolveDocs(input, answers) {
  if (!isTemplateDocSources(input.facts)) {
    if (given(input.values["--docs"]) !== undefined) {
      answers.notes.push(
        "Kept docSources from .qa/project.json; --docs was not applied (edit .qa/project.json to change it).",
      );
    }
    return undefined;
  }
  const reply = await resolveField(
    { name: "documentation", flag: "--docs", label: DOCS_QUESTION, check: docsProblem },
    input,
  );
  return reply === undefined ? undefined : docSourceFor(reply);
}

export async function resolveAnswers(input) {
  const answers = { env: {}, passwords: {}, persistPasswords: [], roles: {}, notes: [] };
  for (const field of SETTINGS) {
    await resolveSetting(field, input, answers);
  }
  await resolvePassword("ADMIN_PASSWORD", "Administrator password", input, answers);
  const customer = await resolveRole("customer", "--customer", "Customer login (email)", input);
  if (customer !== undefined) {
    answers.roles.customer = customer;
  }
  await resolvePassword("CUSTOMER_PASSWORD", "Customer password", input, answers);
  const otherCustomer = await resolveRole("other customer", "--other-customer", "Other customer login (email)", input);
  if (otherCustomer !== undefined) {
    answers.roles.otherCustomer = otherCustomer;
  }
  await resolvePassword("OTHER_CUSTOMER_PASSWORD", "Other customer password", input, answers);
  const tracker = await resolveTracker(input, answers);
  if (tracker !== undefined) {
    answers.tracker = tracker;
  }
  const docs = await resolveDocs(input, answers);
  if (docs !== undefined) {
    answers.docs = docs;
  }
  await resolveSetting(TEST_ID, input, answers);
  return answers;
}
