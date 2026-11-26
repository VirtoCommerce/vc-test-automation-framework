import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { probeBrowserServer } from "./mcp-probe.mjs";
import { maskSecrets } from "./redact.mjs";
import { setEnvValue } from "./suite-files.mjs";

const CERTIFICATE_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_UNTRUSTED",
]);
const HOST_MISMATCH = "ERR_TLS_CERT_ALTNAME_INVALID";
const UNKNOWN_HOST = "ENOTFOUND";
const TRUST_ANY_CERTIFICATE = { NODE_TLS_REJECT_UNAUTHORIZED: "0" };
const REACH_TIMEOUT_MS = 20_000;
const TOKEN_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 180_000;
const DEFAULT_ATTEMPTS = 24;
const DEFAULT_DELAY_MS = 5_000;
const DEFAULT_WAIT_MS = 120_000;
const BODY_LIMIT = 1_048_576;
const EXEC_TIMEOUT_MS = 600_000;
const EXEC_MAX_BUFFER = 64 * 1_048_576;
const SIGN_IN_REFUSED = new Set([400, 401]);
const DETAIL_LIMIT = 200;
const MASK = "***";
const PASSWORD_LOOKING = /\b(\w*(?:password|passwd|secret)\w*\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi;
const STACK_LINE = /^at\s/;
const TELLING_LINE = /error|cannot|failed|missing|not /i;
const BABEL_MISSING =
  /@babel\/parser (is not installed|.*cannot be found)|Cannot find (package|module) '@babel\/parser'/;
const PROJECT_FACTS = ".claude/checks/project-facts.mts";
const FACTS_FILE = ".qa/project.json";
const FACTS_NOTE = /^project-facts:/;
const EXAMPLE_ACCOUNT = /is the template's example account/;
const EXAMPLE_ACCOUNT_FIX =
  "or, for a customer, give its account with npx vc-qa-agents init --customer or --other-customer, or remove that role and its roleFor and passwordFor entries from .qa/project.json until its account is seeded";
const CERTIFICATE_QUESTION = "The certificate is not trusted (self-signed?). Set VERIFY_SSL=false in .env?";
const NO_PLATFORM = "the platform does not answer";
const CANCELLED = "cancelled";

export function request(url, options) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      reject(Object.assign(new Error(`${url} is not a URL`), { code: "ERR_INVALID_URL" }));
      return;
    }
    const transport = target.protocol === "https:" ? https : http;
    const headers = { ...options.headers };
    if (options.body !== undefined) {
      headers["content-length"] = String(Buffer.byteLength(options.body));
    }
    const outgoing = transport.request(
      target,
      { method: options.method ?? "GET", headers, rejectUnauthorized: options.verifySsl, timeout: options.timeoutMs },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          if (body.length < BODY_LIMIT) {
            body += chunk;
          }
        });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
        response.on("error", (error) => reject(Object.assign(error, { code: error.code ?? "ERESPONSE" })));
      },
    );
    outgoing.on("timeout", () => {
      outgoing.destroy(Object.assign(new Error(`no answer in ${options.timeoutMs} ms`), { code: "ETIMEDOUT" }));
    });
    outgoing.on("error", (error) => reject(Object.assign(error, { code: error.code ?? "EREQUEST" })));
    outgoing.end(options.body);
  });
}

export async function checkReachable(url, options) {
  const send = options.request ?? request;
  const started = Date.now();
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
  const timeoutMs = options.timeoutMs ?? REACH_TIMEOUT_MS;
  let last = "";
  let attempts = 0;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    attempts = attempt;
    try {
      const { status } = await send(url, { verifySsl: options.verifySsl, timeoutMs });
      if (status < 500) {
        return { ok: true, detail: `${url} answers (${status})`, certificate: false };
      }
      last = `answered ${status}`;
    } catch (error) {
      const code = error?.code ?? "no answer";
      if (code === HOST_MISMATCH) {
        return {
          ok: false,
          detail: `the certificate of ${url} does not match its host (${code}); use in .env the host name the certificate is issued for.`,
          certificate: false,
        };
      }
      if (CERTIFICATE_CODES.has(code)) {
        return {
          ok: false,
          detail: `the certificate of ${url} is not trusted (${code}); set VERIFY_SSL=false in .env if the stand uses a self-signed certificate.`,
          certificate: true,
        };
      }
      if (code === UNKNOWN_HOST) {
        return {
          ok: false,
          detail: `the host of ${url} is not known (${code}); fix the URL in .env.`,
          certificate: false,
        };
      }
      last = `does not answer (${code})`;
    }
    if (attempt >= options.attempts || Date.now() - started + options.delayMs >= waitMs) {
      break;
    }
    if (attempt === 1) {
      options.onWait?.();
    }
    await sleep(options.delayMs);
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  return {
    ok: false,
    detail: `${url} ${last} after ${attempts} attempts in ${seconds} s; start the stand or fix the URL in .env.`,
    certificate: false,
  };
}

function maskPasswordLooking(text) {
  return text.replace(PASSWORD_LOOKING, `$1${MASK}`);
}

function accessToken(body) {
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.access_token === "string" && parsed.access_token !== "";
  } catch {
    return false;
  }
}

function tokenOutcome(answer, username) {
  if (answer.status >= 200 && answer.status < 300) {
    return accessToken(answer.body)
      ? { ok: true, detail: `${username} gets a token` }
      : {
          ok: false,
          detail:
            "the token request answered without an access_token; check that BACKEND_BASE_URL is the platform, not the frontend.",
        };
  }
  if (SIGN_IN_REFUSED.has(answer.status)) {
    return {
      ok: false,
      detail: `the token request as ${username} answered ${answer.status}; check ADMIN_USERNAME and ADMIN_PASSWORD in .env.`,
    };
  }
  return {
    ok: false,
    detail: `the platform has no /connect/token at BACKEND_BASE_URL (it answered ${answer.status}); check BACKEND_BASE_URL in .env.`,
  };
}

export async function checkAdminToken(backend, credentials, options) {
  const send = options.request ?? request;
  const url = `${backend.replace(/\/+$/, "")}/connect/token`;
  const body = new URLSearchParams({
    grant_type: "password",
    username: credentials.username,
    password: credentials.password,
  }).toString();
  let outcome;
  try {
    const answer = await send(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      verifySsl: options.verifySsl,
      timeoutMs: TOKEN_TIMEOUT_MS,
    });
    outcome = tokenOutcome(answer, credentials.username);
  } catch (error) {
    outcome = {
      ok: false,
      detail: `the token request did not answer (${error?.code ?? "no answer"}); check BACKEND_BASE_URL in .env.`,
    };
  }
  return outcome;
}

export function formatTable(rows) {
  const statusWidth = Math.max(0, ...rows.map((row) => row.status.length));
  const checkWidth = Math.max(0, ...rows.map((row) => row.check.length));
  return rows
    .map((row) =>
      `${row.status.padEnd(statusWidth)}  ${row.check.padEnd(checkWidth)}  ${maskPasswordLooking(row.detail)}`.trimEnd(),
    )
    .join("\n");
}

function defaultExec(command, args, cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    env: env === undefined ? process.env : { ...process.env, ...env },
    shell: process.platform === "win32",
    encoding: "utf8",
    timeout: EXEC_TIMEOUT_MS,
    maxBuffer: EXEC_MAX_BUFFER,
  });
  if (result.error !== undefined) {
    const timedOut = result.error.code === "ETIMEDOUT";
    return {
      status: 1,
      output: timedOut
        ? `${[command, ...args].join(" ")} did not finish in ${EXEC_TIMEOUT_MS / 60_000} minutes`
        : `${result.error.code ?? "error"}: ${result.error.message}`,
    };
  }
  if (result.signal !== null) {
    return { status: 1, output: `${[command, ...args].join(" ")} was stopped (${result.signal})` };
  }
  return {
    status: result.status ?? 1,
    output: [result.stdout, result.stderr].filter((part) => typeof part === "string" && part !== "").join("\n"),
  };
}

function summary(output, secrets) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !STACK_LINE.test(line));
  const line = lines.find((candidate) => TELLING_LINE.test(candidate)) ?? lines[0] ?? "no output";
  return maskSecrets(line, secrets)
    .replace(/[.;]+$/, "")
    .slice(0, DETAIL_LIMIT);
}

function passwordForNames(projectDir) {
  try {
    const passwordFor = JSON.parse(readFileSync(join(projectDir, FACTS_FILE), "utf8"))?.passwordFor;
    return passwordFor !== null && typeof passwordFor === "object"
      ? Object.values(passwordFor).filter((name) => typeof name === "string")
      : [];
  } catch {
    return [];
  }
}

export function secretValues(context) {
  const named = new Set(passwordForNames(context.projectDir));
  return Object.entries(context.vars)
    .filter(([key]) => /PASSWORD|SECRET/.test(key) || named.has(key))
    .map(([, value]) => value)
    .filter((value) => typeof value === "string" && value !== "");
}

function envFileName(suiteDir) {
  return suiteDir === "." ? ".env" : `${suiteDir}/.env`;
}

function row(check, status, detail) {
  return { check, status, detail };
}

function blank(value) {
  return value === undefined || value.trim() === "";
}

function trustBackend(context, verdict) {
  const envPath = join(context.projectDir, context.suiteDir, ".env");
  const text = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  writeFileSync(envPath, setEnvValue(text, "VERIFY_SSL", "false"));
  verdict.verifySsl = false;
}

async function confirmed(prompter, question) {
  try {
    return await prompter.confirm(question);
  } catch (error) {
    if (error instanceof Error && error.message === CANCELLED) {
      return false;
    }
    throw error;
  }
}

function progressOf(context) {
  return context.progress ?? (() => {});
}

function originOf(url) {
  return URL.parse(url)?.origin ?? url;
}

async function reachRow(check, key, context, verdict) {
  const url = context.vars[key];
  if (blank(url)) {
    return row(check, "fail", `${key} is empty; set it in ${envFileName(context.suiteDir)}.`);
  }
  progressOf(context)(`checking the ${check} (${url})...`);
  const reach = () =>
    checkReachable(url, {
      verifySsl: verdict.verifySsl,
      attempts: context.attempts ?? DEFAULT_ATTEMPTS,
      delayMs: context.delayMs ?? DEFAULT_DELAY_MS,
      onWait: () => progressOf(context)(`waiting for ${originOf(url)} to answer...`),
      ...(context.request === undefined ? {} : { request: context.request }),
    });
  let result = await reach();
  if (
    !result.ok &&
    result.certificate &&
    check === "backend" &&
    context.vars["VERIFY_SSL"] !== "false" &&
    context.prompter !== undefined &&
    (await confirmed(context.prompter, CERTIFICATE_QUESTION))
  ) {
    try {
      trustBackend(context, verdict);
    } catch {
      return row(check, "fail", `VERIFY_SSL=false could not be written; set it in ${envFileName(context.suiteDir)}.`);
    }
    result = await reach();
  }
  return row(check, result.ok ? "ok" : "fail", result.detail);
}

function execRow(check, context, command, args, cwd, onFail, env) {
  progressOf(context)(`checking the ${check} (${[command, ...args].join(" ")})...`);
  const result = (context.exec ?? defaultExec)(command, args, cwd, env);
  return result.status === 0 ? row(check, "ok", `${[command, ...args].join(" ")} passes`) : onFail(result.output);
}

function factsProblems(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !FACTS_NOTE.test(line) && !STACK_LINE.test(line) && !BABEL_MISSING.test(line));
}

function projectFactsRow(context) {
  return execRow("project facts", context, "node", [PROJECT_FACTS], context.projectDir, (output) => {
    const problems = factsProblems(output);
    if (problems.length === 0 && BABEL_MISSING.test(output)) {
      return row("project facts", "skipped", "dependencies not installed");
    }
    const said = summary(problems.length === 0 ? output : (problems[0] ?? ""), secretValues(context));
    const fix = EXAMPLE_ACCOUNT.test(output)
      ? `${EXAMPLE_ACCOUNT_FIX}.`
      : `fix .qa/project.json until node ${PROJECT_FACTS} passes.`;
    return row("project facts", "fail", `${said}; ${fix}`);
  });
}

function suiteReason(context, rows) {
  if (context.skipVerify) {
    return "--skip-verify: no network checks";
  }
  if (context.skipInstall) {
    return "--skip-install: dependencies not installed";
  }
  if (rows.backend.status !== "ok") {
    return NO_PLATFORM;
  }
  for (const name of ["ADMIN_USERNAME", "ADMIN_PASSWORD"]) {
    if (blank(context.vars[name])) {
      return `${name} is empty; set it in ${envFileName(context.suiteDir)}`;
    }
  }
  return undefined;
}

export async function runReadiness(context) {
  const verdict = { verifySsl: context.vars["VERIFY_SSL"] !== "false" };
  const offline = "--skip-verify: no network checks";
  const rows = {};
  rows.backend = context.skipVerify
    ? row("backend", "skipped", offline)
    : await reachRow("backend", "BACKEND_BASE_URL", context, verdict);
  rows.frontend = context.skipVerify
    ? row("frontend", "skipped", offline)
    : await reachRow("frontend", "FRONTEND_BASE_URL", context, verdict);

  if (context.skipVerify) {
    rows.administrator = row("administrator", "skipped", offline);
  } else if (rows.backend.status !== "ok") {
    rows.administrator = row("administrator", "skipped", NO_PLATFORM);
  } else if (blank(context.vars["ADMIN_USERNAME"])) {
    rows.administrator = row(
      "administrator",
      "skipped",
      `ADMIN_USERNAME is empty; set it in ${envFileName(context.suiteDir)}`,
    );
  } else if (blank(context.vars["ADMIN_PASSWORD"])) {
    rows.administrator = row(
      "administrator",
      "skipped",
      `ADMIN_PASSWORD is empty; set it in ${envFileName(context.suiteDir)}`,
    );
  } else {
    progressOf(context)(`checking the administrator (${context.vars["ADMIN_USERNAME"]} signs in)...`);
    const token = await checkAdminToken(
      context.vars["BACKEND_BASE_URL"] ?? "",
      { username: context.vars["ADMIN_USERNAME"] ?? "", password: context.vars["ADMIN_PASSWORD"] ?? "" },
      { verifySsl: verdict.verifySsl, ...(context.request === undefined ? {} : { request: context.request }) },
    );
    rows.administrator = row("administrator", token.ok ? "ok" : "fail", token.detail);
  }

  rows.facts = projectFactsRow(context);

  const suiteCwd = join(context.projectDir, context.suiteDir);
  const secrets = secretValues(context);
  const childEnv = verdict.verifySsl ? undefined : TRUST_ANY_CERTIFICATE;
  const typesReason = suiteReason(context, rows);
  rows.types =
    typesReason === undefined
      ? execRow(
          "types",
          context,
          "npm",
          ["run", "codegen"],
          suiteCwd,
          (output) =>
            row(
              "types",
              "fail",
              `npm run codegen failed: ${summary(output, secrets)}; run it in ${context.suiteDir} to see the whole output.`,
            ),
          childEnv,
        )
      : row("types", "skipped", typesReason);

  let testReason = typesReason;
  if (testReason === undefined && rows.administrator.status !== "ok") {
    testReason = "the administrator cannot sign in";
  }
  if (testReason === undefined && rows.types.status !== "ok") {
    testReason = "the types were not generated";
  }
  rows.firstTest =
    testReason === undefined
      ? execRow(
          "first test",
          context,
          "npm",
          ["test"],
          suiteCwd,
          (output) =>
            row(
              "first test",
              "fail",
              `npm test failed: ${summary(output, secrets)}; run it in ${context.suiteDir} to see the report.`,
            ),
          childEnv,
        )
      : row("first test", "skipped", testReason);

  if (context.skipVerify) {
    rows.browser = row("browser server", "skipped", offline);
  } else if (rows.frontend.status !== "ok") {
    rows.browser = row("browser server", "skipped", "the frontend does not answer");
  } else {
    progressOf(context)(`checking the browser server (opens ${context.vars["FRONTEND_BASE_URL"]})...`);
    const probe = context.probe ?? probeBrowserServer;
    let result;
    try {
      result = await probe({
        projectDir: context.projectDir,
        frontendUrl: context.vars["FRONTEND_BASE_URL"] ?? "",
        timeoutMs: PROBE_TIMEOUT_MS,
        secrets,
        withheld: context.withheld ?? [],
      });
    } catch (error) {
      result = {
        ok: false,
        detail: `the browser server could not be checked (${error?.code ?? "error"}); run node .claude/checks/browser-mcp.mts to see why.`,
      };
    }
    rows.browser = row("browser server", result.ok ? "ok" : "fail", result.detail);
  }

  return [rows.backend, rows.frontend, rows.administrator, rows.facts, rows.types, rows.firstTest, rows.browser];
}
