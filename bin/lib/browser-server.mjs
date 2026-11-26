import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MCP_FILE = ".mcp.json";
const BROWSER_SERVER = "playwright";
const LAUNCHER = "browser-mcp.mts";
const SERVER_PACKAGE = "@playwright/mcp";

export const LAUNCHER_SNIPPET = `"${BROWSER_SERVER}": { "command": "node", "args": [".claude/checks/${LAUNCHER}"] }`;

function browserServer(target) {
  const path = join(target, MCP_FILE);
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")).mcpServers?.[BROWSER_SERVER];
  } catch {
    return undefined;
  }
}

export function browserServerKind(target) {
  const server = browserServer(target);
  if (server === undefined || server === null) {
    return "none";
  }
  const args = Array.isArray(server.args) ? server.args.filter((arg) => typeof arg === "string") : [];
  if (args.some((arg) => arg.includes(LAUNCHER))) {
    return "launcher";
  }
  const command = typeof server.command === "string" ? server.command : "";
  return [command, ...args].some((part) => part.includes(SERVER_PACKAGE)) ? "direct" : "other";
}
