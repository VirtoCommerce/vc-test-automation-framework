import { envValueProblem } from "./suite-files.mjs";

export const PASSWORD_NAMES = ["ADMIN_PASSWORD", "CUSTOMER_PASSWORD", "OTHER_CUSTOMER_PASSWORD"];

const ATTEMPTS = 3;
const PLACEHOLDER_DOMAIN = "@your-company.test";
const TEMPLATE_TRACKER = { kind: "jira", keyPattern: "^PROJ-\\d+$" };
const KEY_PATTERN_FOR = { "azure-boards": "^\\d+$" };

function urlProblem(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:" ? undefined : "must be an http or https URL";
  } catch {
    return "must be an http or https URL";
  }
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

const SETTINGS = [
  { name: "BACKEND_BASE_URL", flag: "--backend-url", label: "Backend (platform) URL", check: urlProblem },
  { name: "FRONTEND_BASE_URL", flag: "--frontend-url", label: "Frontend (storefront) URL", check: urlProblem },
  { name: "STORE_ID", flag: "--store-id", label: "Store id", check: blankProblem },
  {
    name: "ADMIN_USERNAME",
    flag: "--admin-login",
    label: "Administrator login",
    check: blankProblem,
    fallback: "admin",
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

async function resolveField(field, input) {
  const { name, flag, shellName, label, check, fallback } = field;
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

async function resolveSetting(field, input, answers) {
  if (filled(input.existingEnv[field.name])) {
    return;
  }
  function check(value) {
    return field.check(value) ?? envValueProblem(value);
  }
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

async function resolveTracker(input) {
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
      label: "Tracker kind (jira, azure-boards or another)",
      check: blankProblem,
      fallback: TEMPLATE_TRACKER.kind,
    },
    input,
  );
  const keyPattern = await resolveField(
    {
      name: "ticket-key pattern",
      flag: "--key-pattern",
      label: "Ticket-key pattern, a regular expression such as ^ABC-\\d+$",
      check: patternProblem,
      fallback: KEY_PATTERN_FOR[kind],
    },
    input,
  );
  return keyPattern === undefined ? undefined : { kind, keyPattern };
}

export async function resolveAnswers(input) {
  const answers = { env: {}, passwords: {}, persistPasswords: [], roles: {} };
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
  const tracker = await resolveTracker(input);
  if (tracker !== undefined) {
    answers.tracker = tracker;
  }
  await resolveSetting(TEST_ID, input, answers);
  return answers;
}
