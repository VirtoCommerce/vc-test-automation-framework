import { applyFacts, envValueProblem, roleNameFor } from "./suite-files.mjs";
import { keyPatternProblem, trackerKind, trackerKindProblem } from "./tracker-key.mjs";

export const PASSWORD_NAMES = ["ADMIN_PASSWORD", "CUSTOMER_PASSWORD", "OTHER_CUSTOMER_PASSWORD"];

const ATTEMPTS = 3;
const NO_OTHER_CUSTOMER = "--no-other-customer";
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
const CUSTOMER_QUESTION = "Customer login (email; required: the tests sign in to the frontend as this customer)";
const OTHER_CUSTOMER_QUESTION = "Other customer login (email; empty if the stand has none)";
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
  { name: "FRONTEND_BASE_URL", flag: "--frontend-url", label: "Frontend URL", check: urlProblem },
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
  label: "Test-id attribute of the frontend",
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
  for (const flag of ["--customer", "--other-customer"]) {
    givenValue({ flag, check: blankProblem }, input);
  }
  if (input.switches.has(NO_OTHER_CUSTOMER) && given(input.values["--other-customer"]) !== undefined) {
    throw new Error(`${NO_OTHER_CUSTOMER} and --other-customer cannot be given together`);
  }
  const kind = givenValue({ flag: "--tracker", check: trackerKindProblem }, input);
  givenValue({ flag: "--key-pattern", check: (value) => keyPatternProblem(kind, value) }, input);
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

function namesPassword(facts, name) {
  const passwordFor = facts["passwordFor"];
  if (passwordFor === null || typeof passwordFor !== "object") {
    return true;
  }
  return Object.entries(passwordFor).some(([role, variable]) => variable === name && roleOf(facts, role) !== undefined);
}

async function resolveRolePassword(name, label, input, answers) {
  if (namesPassword(applyFacts(input.facts, answers), name)) {
    await resolvePassword(name, label, input, answers);
  }
}

async function resolveCustomer(input, answers) {
  if (!isPlaceholder(roleOf(input.facts, roleNameFor(input.facts, "customer")))) {
    return;
  }
  const login = await resolveField(
    { name: "customer login", flag: "--customer", label: CUSTOMER_QUESTION, check: blankProblem, required: true },
    input,
  );
  if (login !== undefined) {
    answers.roles.customer = login;
  }
}

async function resolveOtherCustomer(input, answers) {
  const role = roleNameFor(input.facts, "otherCustomer");
  if (input.switches.has(NO_OTHER_CUSTOMER)) {
    if (roleOf(input.facts, role) !== undefined) {
      answers.roles.otherCustomer = null;
    }
    return;
  }
  if (!isPlaceholder(roleOf(input.facts, role))) {
    return;
  }
  const login = await resolveField(
    { name: "other customer login", flag: "--other-customer", label: OTHER_CUSTOMER_QUESTION, check: blankProblem },
    input,
  );
  if (login !== undefined) {
    answers.roles.otherCustomer = login;
  } else if (input.prompter !== undefined) {
    answers.roles.otherCustomer = null;
  }
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
  const answered = await resolveField(
    {
      name: "tracker kind",
      flag: "--tracker",
      label: "Where are your tickets tracked? (jira, azure-boards or another tracker's name)",
      check: trackerKindProblem,
      required: true,
    },
    input,
  );
  if (answered === undefined) {
    answers.notes.push("Ignored --key-pattern: the tracker kind is not given; pass --tracker too.");
    return undefined;
  }
  const kind = trackerKind(answered);
  const keyPattern = await resolveField(
    {
      name: "ticket-key pattern",
      flag: "--key-pattern",
      label: keyPatternLabel(kind),
      check: (value) => keyPatternProblem(kind, value),
      fallback: KEY_PATTERN_FOR[kind],
      required: KEY_PATTERN_FOR[kind] === undefined,
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
  await resolveCustomer(input, answers);
  await resolveRolePassword("CUSTOMER_PASSWORD", "Customer password", input, answers);
  await resolveOtherCustomer(input, answers);
  await resolveRolePassword("OTHER_CUSTOMER_PASSWORD", "Other customer password", input, answers);
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
