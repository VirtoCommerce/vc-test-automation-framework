import { spawn, spawnSync } from "node:child_process";

const LAUNCHER = ".claude/checks/browser-mcp.mts";
const PROTOCOL_VERSION = "2025-06-18";
const CLIENT = { name: "vc-qa-agents-readiness", version: "1.0.0" };
const MISSING_BROWSER = /Executable doesn't exist|browser_install/;
const DETAIL_LIMIT = 200;
const NOISE_LINE = /^(at\s|Node\.js v|\^|\}$|code:)/;
const TELLING_LINE = /error|cannot|failed|not found/i;

function firstLine(text) {
  const line = text
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part !== "");
  return line === undefined ? "" : line.slice(0, DETAIL_LIMIT);
}

function lastTellingLine(text) {
  const lines = text
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter((part) => part !== "" && !NOISE_LINE.test(part));
  const line = lines.findLast((part) => TELLING_LINE.test(part)) ?? lines.at(-1) ?? "";
  return line.slice(0, DETAIL_LIMIT);
}

function resultText(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function killTree(child) {
  if (child.pid === undefined || child.exitCode !== null) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

function connect(child) {
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
    const said = lastTellingLine(stderr);
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

async function navigate(channel, frontendUrl) {
  const call = () => channel.call("tools/call", { name: "browser_navigate", arguments: { url: frontendUrl } });
  let answer = await call();
  if (answer.result?.isError === true && MISSING_BROWSER.test(resultText(answer.result))) {
    const installed = await channel.call("tools/call", { name: "browser_install", arguments: {} });
    if (installed.error !== undefined || installed.result?.isError === true) {
      return {
        ok: false,
        detail:
          "the browser server has no browser and could not install it; run npx @playwright/mcp install-browser chromium.",
      };
    }
    answer = await call();
  }
  if (answer.error !== undefined) {
    return {
      ok: false,
      detail: `the browser server refused browser_navigate (${firstLine(String(answer.error.message ?? ""))}); update the package and run init again.`,
    };
  }
  if (answer.result?.isError === true) {
    return {
      ok: false,
      detail: `the browser server could not open ${frontendUrl} (${firstLine(resultText(answer.result))}); check FRONTEND_BASE_URL in .env.`,
    };
  }
  return { ok: true, detail: `opened ${frontendUrl} through the browser server` };
}

async function talk(channel, frontendUrl) {
  const initialized = await channel.call("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: CLIENT,
  });
  if (initialized.error !== undefined) {
    return {
      ok: false,
      detail: `the browser server refused initialize (${firstLine(String(initialized.error.message ?? ""))}); update the package and run init again.`,
    };
  }
  channel.send("notifications/initialized", {});
  return navigate(channel, frontendUrl);
}

export async function probeBrowserServer({ projectDir, frontendUrl, timeoutMs }) {
  const child = spawn("node", [LAUNCHER], {
    cwd: projectDir,
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  const channel = connect(child);
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
      talk(channel, frontendUrl).catch((error) => ({
        ok: false,
        detail: `${error.message}; run node ${LAUNCHER} to see its errors.`,
      })),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
    killTree(child);
  }
}
