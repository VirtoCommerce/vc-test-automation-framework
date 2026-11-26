import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

const ASSIGNMENT = /^(\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=)(.*)$/;
const EMPTY_WITH_COMMENT = /^\s*(?:(["'`])\1)?\s*(#.*)?$/;
const TEMPLATE_ADMINISTRATOR = "admin";

function lineEnding(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function storedForm(value) {
  if (/[\r\n]/.test(value)) {
    return undefined;
  }
  return [value, `'${value}'`, `"${value}"`, `\`${value}\``].find(
    (candidate) => parseEnv(`KEY=${candidate}`)["KEY"] === value,
  );
}

export function envValueProblem(value) {
  return storedForm(value) === undefined
    ? "cannot be written to .env (quotes of every kind or a line break)"
    : undefined;
}

function formatValue(key, value) {
  const stored = storedForm(value);
  if (stored === undefined) {
    throw new Error(`${key} ${envValueProblem(value)}`);
  }
  return stored;
}

function isEmptyValue(line, key) {
  return parseEnv(line)[key] === "";
}

function filledValue(key, current, value) {
  const comment = EMPTY_WITH_COMMENT.exec(current)?.[2];
  return comment === undefined ? formatValue(key, value) : `${formatValue(key, value)} ${comment}`;
}

function rewrite(text, values, replace) {
  const eol = lineEnding(text);
  const parts = text.split(/(\r?\n)/);
  const seen = new Set();
  for (let index = 0; index < parts.length; index += 2) {
    const match = ASSIGNMENT.exec(parts[index]);
    if (match === null) {
      continue;
    }
    const [, prefix, key, current] = match;
    if (!Object.hasOwn(values, key) || values[key] === undefined) {
      continue;
    }
    seen.add(key);
    if (replace) {
      parts[index] = `${prefix}${formatValue(key, values[key])}`;
    } else if (isEmptyValue(parts[index], key)) {
      parts[index] = `${prefix}${filledValue(key, current, values[key])}`;
    }
  }
  let result = parts.join("");
  for (const [key, value] of Object.entries(values)) {
    if (seen.has(key) || value === undefined) {
      continue;
    }
    if (result !== "" && !result.endsWith("\n")) {
      result += eol;
    }
    result += `${key}=${formatValue(key, value)}${eol}`;
  }
  return result;
}

export function fillEnvText(text, values) {
  return rewrite(text, values, false);
}

export function setEnvValue(text, key, value) {
  return rewrite(text, { [key]: value }, true);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function applyFacts(facts, answers, adminLogin) {
  const result = structuredClone(facts);
  const roles = isRecord(result["roles"]) ? result["roles"] : {};
  const administrator = roles["administrator"];
  if (adminLogin && (administrator === undefined || administrator === TEMPLATE_ADMINISTRATOR)) {
    roles["administrator"] = adminLogin;
  }
  if (answers.roles.customer !== undefined) {
    roles["customer"] = answers.roles.customer;
  }
  if (answers.roles.otherCustomer !== undefined) {
    roles["other customer"] = answers.roles.otherCustomer;
  }
  if (Object.keys(roles).length > 0) {
    result["roles"] = roles;
  }
  if (answers.tracker !== undefined) {
    const tracker = isRecord(result["tracker"]) ? result["tracker"] : {};
    result["tracker"] = { ...tracker, kind: answers.tracker.kind, keyPattern: answers.tracker.keyPattern };
  }
  return result;
}

export function writeAnswers(projectDir, suiteDir, answers) {
  const envPath = join(projectDir, suiteDir, ".env");
  const envText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const values = { ...answers.env };
  for (const name of answers.persistPasswords) {
    if (answers.passwords[name] !== undefined) {
      values[name] = answers.passwords[name];
    }
  }
  const filledText = fillEnvText(envText, values);
  if (filledText !== envText) {
    writeFileSync(envPath, filledText);
  }
  const adminLogin = parseEnv(filledText)["ADMIN_USERNAME"] ?? answers.env["ADMIN_USERNAME"];
  const factsPath = join(projectDir, ".qa", "project.json");
  const factsText = readFileSync(factsPath, "utf8");
  const facts = JSON.parse(factsText);
  const updated = applyFacts(facts, answers, adminLogin);
  if (JSON.stringify(updated) !== JSON.stringify(facts)) {
    const eol = lineEnding(factsText);
    writeFileSync(factsPath, `${JSON.stringify(updated, null, 2)}\n`.replaceAll("\n", eol));
  }
}
