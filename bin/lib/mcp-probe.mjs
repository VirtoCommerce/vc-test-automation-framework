import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { maskSecrets } from "./redact.mjs";

const LAUNCHER = ".claude/checks/browser-mcp.mts";
const PROTOCOL_VERSION = "2025-06-18";
const CLIENT = { name: "vc-qa-agents-readiness", version: "1.0.0" };
const MISSING_BROWSER = /Executable doesn't exist|is not installed|browser_install/;
const SERVER_BROWSER = "chrome-for-testing";
const DETAIL_LIMIT = 200;
const NOISE_LINE = /^(at\s|Node\.js v|\^|\}$|code:)/;
const TELLING_LINE = /error|cannot|failed|not found/i;
const PINNED_PACKAGE = /BROWSER_SERVER_PACKAGE\s*=\s*["'`]([^"'`]+)["'`]/;
const FALLBACK_PACKAGE = "@playwright/mcp";
const NO_RESULT = "the browser server sent no result";
const EXEC_MAX_BUFFER = 64 * 1_048_576;
const TEST_ID_ATTRIBUTES = ["data-testid", "data-test-id", "data-test", "data-qa", "data-cy"];
const COUNT_TEST_IDS = `() => Object.fromEntries(${JSON.stringify(TEST_ID_ATTRIBUTES)}.map((name) => [name, document.querySelectorAll("[" + name + "]").length]))`;
const EVALUATE_TIMEOUT_MS = 20_000;
const STOP_TIMEOUT_MS = 5_000;
const RESULT_SECTION = /^### Result[ \t]*\r?\n([\s\S]*?)(?=^### |(?![\s\S]))/m;
const CODE_FENCE = /^```\w*\s*|\s*```$/g;

function firstLine(text, secrets) {
  const line = text
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part !== "" && !part.startsWith("#"));
  return line === undefined ? "" : maskSecrets(line, secrets).slice(0, DETAIL_LIMIT);
}

function lastTellingLine(text, secrets) {
  const lines = text
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter((part) => part !== "" && !NOISE_LINE.test(part));
  const line = lines.findLast((part) => TELLING_LINE.test(part)) ?? lines.at(-1) ?? "";
  return maskSecrets(line, secrets).slice(0, DETAIL_LIMIT);
}

function resultText(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

export function serverPackage(projectDir) {
  try {
    return PINNED_PACKAGE.exec(readFileSync(join(projectDir, LAUNCHER), "utf8"))?.[1] ?? FALLBACK_PACKAGE;
  } catch {
    return FALLBACK_PACKAGE;
  }
}

export function browserInstallCommand(projectDir) {
  return `npx -y ${serverPackage(projectDir)} install-browser ${SERVER_BROWSER}`;
}

function runCaptured(command, cwd) {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: EXEC_MAX_BUFFER,
  });
  const output = [result.stdout, result.stderr].filter((part) => typeof part === "string" && part !== "").join("\n");
  if (result.error !== undefined) {
    return { status: 1, output: `${output}\n${result.error.code ?? result.error.message}` };
  }
  return { status: result.status ?? 1, output };
}

export function installServerBrowser(projectDir, cwd, options = {}) {
  const command = browserInstallCommand(projectDir);
  options.progress?.(`installing the browser server's browser (${serverPackage(projectDir)})...`);
  const result = (options.exec ?? runCaptured)(command, cwd);
  if (result.status === 0) {
    return `Installed the browser server's browser (${serverPackage(projectDir)}).`;
  }
  const said = lastTellingLine(result.output, options.secrets ?? []);
  const reason = said === "" ? `"${command}" failed with exit code ${result.status}` : said;
  return `The browser server's own browser was not installed (${reason}).`;
}

function installHint(projectDir) {
  return `the browser server has no browser and could not install it; run ${browserInstallCommand(projectDir)}.`;
}

function killTree(child) {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  }
}

/**
 * Stops the server's whole tree and waits until the server has exited. Without the wait the probe returns while the
 * killed server is still an unreaped child, which the operating system still lists as a live process.
 */
async function stopTree(child) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = new Promise((resolve) => child.once("exit", resolve));
  killTree(child);
  let timer;
  const gaveUp = new Promise((resolve) => {
    timer = setTimeout(resolve, STOP_TIMEOUT_MS);
    timer.unref();
  });
  await Promise.race([exited, gaveUp]);
  clearTimeout(timer);
}

function connect(child, secrets) {
  const waiting = new Map();
  let buffer = "";
  let stderr = "";
  let stopped;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let end = buffer.indexOf("\n");
    while (end !== -1) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      end = buffer.indexOf("\n");
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message?.method !== undefined) {
        continue;
      }
      const pending = waiting.get(message?.id);
      if (pending !== undefined) {
        waiting.delete(message.id);
        pending.resolve(message);
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4096);
  });
  function stop(reason) {
    stopped = reason;
    for (const pending of waiting.values()) {
      pending.reject(new Error(reason));
    }
    waiting.clear();
  }
  child.on("error", (error) => stop(`the browser server could not start (${error.code ?? error.message})`));
  child.on("exit", () => {
    const said = lastTellingLine(stderr, secrets);
    stop(said === "" ? "the browser server stopped" : `the browser server stopped: ${said}`);
  });
  let nextId = 0;
  return {
    send(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    },
    call(method, params) {
      if (stopped !== undefined) {
        return Promise.reject(new Error(stopped));
      }
      nextId += 1;
      const id = nextId;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    },
  };
}

export function chosenTestIdAttribute(counts) {
  if (counts === null || typeof counts !== "object") {
    return undefined;
  }
  const ranked = TEST_ID_ATTRIBUTES.map((name) => [name, Number(counts[name])])
    .filter(([, count]) => Number.isInteger(count) && count > 0)
    .sort((left, right) => right[1] - left[1]);
  if (ranked.length === 0 || (ranked.length > 1 && ranked[0][1] === ranked[1][1])) {
    return undefined;
  }
  return ranked[0][0];
}

function evaluationCounts(text) {
  const section = RESULT_SECTION.exec(text)?.[1] ?? text;
  try {
    return JSON.parse(section.trim().replace(CODE_FENCE, ""));
  } catch {
    return undefined;
  }
}

async function detectTestIdAttribute(channel, options) {
  let timer;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(undefined), options.evaluateTimeoutMs ?? EVALUATE_TIMEOUT_MS);
  });
  try {
    const answer = await Promise.race([
      channel.call("tools/call", { name: "browser_evaluate", arguments: { function: COUNT_TEST_IDS } }),
      late,
    ]);
    if (answer?.result === undefined || answer.result.isError === true) {
      return undefined;
    }
    return chosenTestIdAttribute(evaluationCounts(resultText(answer.result)));
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

function missingBrowser(answer) {
  return answer.result?.isError === true && MISSING_BROWSER.test(resultText(answer.result));
}

async function navigate(channel, frontendUrl, options) {
  const call = () => channel.call("tools/call", { name: "browser_navigate", arguments: { url: frontendUrl } });
  let answer = await call();
  if (missingBrowser(answer)) {
    const installed = await channel.call("tools/call", { name: "browser_install", arguments: {} });
    if (installed.error !== undefined || installed.result?.isError === true) {
      return { ok: false, detail: installHint(options.projectDir) };
    }
    answer = await call();
    if (missingBrowser(answer)) {
      return { ok: false, detail: installHint(options.projectDir) };
    }
  }
  if (answer.error !== undefined) {
    const said = firstLine(String(answer.error.message ?? ""), options.secrets);
    return {
      ok: false,
      detail: `the browser server refused browser_navigate (${said}); update the package and run init again.`,
    };
  }
  if (answer.result === undefined) {
    return { ok: false, detail: `${NO_RESULT} to browser_navigate; update the package and run init again.` };
  }
  if (answer.result.isError === true) {
    const said = firstLine(resultText(answer.result), options.secrets);
    return {
      ok: false,
      detail: `the browser server could not open ${frontendUrl} (${said}); check FRONTEND_BASE_URL in .env.`,
    };
  }
  return {
    ok: true,
    detail: `opened ${frontendUrl} through the browser server`,
    testIdAttribute: await detectTestIdAttribute(channel, options),
  };
}

async function talk(channel, frontendUrl, options) {
  const initialized = await channel.call("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: CLIENT,
  });
  if (initialized.error !== undefined) {
    return {
      ok: false,
      detail: `the browser server refused initialize (${firstLine(String(initialized.error.message ?? ""), options.secrets)}); update the package and run init again.`,
    };
  }
  if (initialized.result === undefined) {
    return { ok: false, detail: `${NO_RESULT} to initialize; update the package and run init again.` };
  }
  channel.send("notifications/initialized", {});
  return navigate(channel, frontendUrl, options);
}

function envWithout(names) {
  const withheld = new Set(names.map((name) => name.toUpperCase()));
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !withheld.has(name.toUpperCase())));
}

export async function probeBrowserServer(options) {
  const { projectDir, frontendUrl, timeoutMs } = options;
  const secrets = options.secrets ?? [];
  const child = spawn("node", [LAUNCHER], {
    cwd: projectDir,
    env: envWithout(options.withheld ?? []),
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  const channel = connect(child, secrets);
  child.stdin.on("error", () => {});
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      resolve({
        ok: false,
        detail: `the browser server did not answer in ${Math.round(timeoutMs / 1000)} s; run node ${LAUNCHER} to see its errors.`,
      });
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      talk(channel, frontendUrl, { projectDir, secrets, evaluateTimeoutMs: options.evaluateTimeoutMs }).catch(
        (error) => ({
          ok: false,
          detail: `${maskSecrets(error.message, secrets)}; run node ${LAUNCHER} to see its errors.`,
        }),
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
    await stopTree(child);
  }
}
