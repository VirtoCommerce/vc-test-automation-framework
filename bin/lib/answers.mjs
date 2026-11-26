import { applyFacts, envValueProblem, FRONTEND_SIGN_INS, roleNameFor } from "./suite-files.mjs";
import { keyPatternProblem, trackerKind, trackerKindProblem } from "./tracker-key.mjs";

export const PASSWORD_NAMES = ["ADMIN_PASSWORD", "CUSTOMER_PASSWORD", "OTHER_CUSTOMER_PASSWORD"];

const ATTEMPTS = 3;
const PLACEHOLDER_DOMAIN = "@your-company.test";
const TEMPLATE_TRACKER = { kind: "jira", keyPattern: "^PROJ-\\d+$" };
const KEY_PATTERN_FOR = { "azure-boards": "^\\d+$" };
const TEMPLATE_DOC_SOURCES = [
  { name: "Virto Commerce documentation", route: "api", where: "https://docs.virtocommerce.org" },
];
const DOC_SOURCE_NAME = "Project documentation";
const CUSTOMER_QUESTION = "Customer accounts already on the stand? Customer login (email; empty if none)";
const OTHER_CUSTOMER_QUESTION = "Other customer login (email of a customer of another organization; empty if none)";
const URL_PREFIX = /^https?(?::|\/\/)/i;
const MCP_PREFIX = /^mcp:/i;

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
  const { name, label, check, fallback } = field;
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
    if (reply === "") {
      return fallback;
    }
    problem = check(reply);
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

function frontendSignInProblem(value) {
  return FRONTEND_SIGN_INS.includes(value) ? undefined : `must be ${FRONTEND_SIGN_INS.join(" or ")}`;
}

export function checkGivenValues(input) {
  for (const field of [...SETTINGS, TEST_ID]) {
    givenValue({ ...field, check: settingCheck(field), shellName: field.name }, input);
  }
  const customer = givenValue({ flag: "--customer", check: blankProblem }, input);
  const otherCustomer = givenValue({ flag: "--other-customer", check: blankProblem }, input);
  if (customer !== undefined && otherCustomer !== undefined && customer.toLowerCase() === otherCustomer.toLowerCase()) {
    throw new Error("--customer and --other-customer must be two accounts, not one");
  }
  if (otherCustomer !== undefined && customer === undefined && !hasCustomer(input.facts ?? {})) {
    throw new Error("--other-customer needs --customer: the other customer is a customer of another organization");
  }
  const kind = givenValue({ flag: "--tracker", check: trackerKindProblem }, input);
  const keyPattern = givenValue({ flag: "--key-pattern", check: (value) => keyPatternProblem(kind, value) }, input);
  if (keyPattern !== undefined && kind === undefined) {
    throw new Error("--key-pattern needs --tracker");
  }
  if (kind !== undefined && keyPattern === undefined && KEY_PATTERN_FOR[trackerKind(kind)] === undefined) {
    throw new Error(`--tracker ${trackerKind(kind)} needs --key-pattern`);
  }
  givenValue({ flag: "--docs", check: docsProblem }, input);
  givenValue({ flag: "--frontend-sign-in", check: frontendSignInProblem }, input);
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

function heldAccount(facts, role) {
  const account = roleOf(facts, role);
  return account !== undefined && !isPlaceholder(account);
}

function hasCustomer(facts) {
  const roleFor = facts["roleFor"];
  return roleFor !== null && typeof roleFor === "object" && heldAccount(facts, roleFor["customer"]);
}

function resolveCustomerRole(purpose, flag, input, answers) {
  const login = givenValue({ flag, check: blankProblem }, input);
  if (login === undefined) {
    return;
  }
  const role = roleNameFor(input.facts, purpose);
  const held = roleOf(input.facts, role);
  if (heldAccount(input.facts, role)) {
    if (held.toLowerCase() !== login.toLowerCase()) {
      answers.notes.push(
        `Kept roles["${role}"] from .qa/project.json; ${flag} was not applied (edit .qa/project.json to change it).`,
      );
    }
    return;
  }
  answers.roles[purpose] = login;
}

function resolveCustomerFlags(input, answers) {
  resolveCustomerRole("customer", "--customer", input, answers);
  resolveCustomerRole("otherCustomer", "--other-customer", input, answers);
}

async function askCustomer(purpose, label, input, answers) {
  const login = await resolveField({ name: `${purpose} login`, label, check: blankProblem }, input);
  if (login !== undefined) {
    answers.roles[purpose] = login;
  }
}

async function resolveCustomers(input, answers) {
  resolveCustomerFlags(input, answers);
  const interactive = input.prompter !== undefined;
  if (interactive && answers.roles.customer === undefined && !hasCustomer(input.facts)) {
    await askCustomer("customer", CUSTOMER_QUESTION, input, answers);
  }
  await resolveRolePassword("CUSTOMER_PASSWORD", "Customer password", input, answers);
  const otherHeld = heldAccount(input.facts, roleNameFor(input.facts, "otherCustomer"));
  if (interactive && answers.roles.customer !== undefined && answers.roles.otherCustomer === undefined && !otherHeld) {
    await askCustomer("otherCustomer", OTHER_CUSTOMER_QUESTION, input, answers);
    const placeholder = roleOf(input.facts, roleNameFor(input.facts, "otherCustomer")) !== undefined;
    if (answers.roles.otherCustomer === undefined && placeholder) {
      answers.roles.otherCustomer = null;
    }
  }
  await resolveRolePassword("OTHER_CUSTOMER_PASSWORD", "Other customer password", input, answers);
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

function hasTracker(facts) {
  const tracker = facts["tracker"];
  return tracker !== null && typeof tracker === "object" && !isTemplateTracker(facts);
}

function resolveTracker(input, answers) {
  const answered = givenValue({ flag: "--tracker", check: trackerKindProblem }, input);
  if (answered === undefined) {
    return undefined;
  }
  if (hasTracker(input.facts)) {
    answers.notes.push(
      "Kept tracker from .qa/project.json; --tracker and --key-pattern were not applied (edit .qa/project.json to change it).",
    );
    return undefined;
  }
  const kind = trackerKind(answered);
  const keyPattern =
    givenValue({ flag: "--key-pattern", check: (value) => keyPatternProblem(kind, value) }, input) ??
    KEY_PATTERN_FOR[kind];
  return { kind, keyPattern };
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

function resolveDocs(input, answers) {
  if (!isTemplateDocSources(input.facts)) {
    if (given(input.values["--docs"]) !== undefined) {
      answers.notes.push(
        "Kept docSources from .qa/project.json; --docs was not applied (edit .qa/project.json to change it).",
      );
    }
    return undefined;
  }
  const reply = givenValue({ flag: "--docs", check: docsProblem }, input);
  return reply === undefined ? undefined : docSourceFor(reply);
}

export async function resolveAnswers(input) {
  const answers = { env: {}, passwords: {}, persistPasswords: [], roles: {}, notes: [] };
  for (const field of SETTINGS) {
    await resolveSetting(field, input, answers);
  }
  await resolvePassword("ADMIN_PASSWORD", "Administrator password", input, answers);
  await resolveCustomers(input, answers);
  const tracker = resolveTracker(input, answers);
  if (tracker !== undefined) {
    answers.tracker = tracker;
  }
  const docs = resolveDocs(input, answers);
  if (docs !== undefined) {
    answers.docs = docs;
  }
  await resolveSetting(TEST_ID, { ...input, prompter: undefined }, answers);
  return answers;
}
