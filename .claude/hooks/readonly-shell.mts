import type { hookBlockReason } from "../qa/readonly-shell.mts";

import { readFileSync } from "node:fs";
import { basename } from "node:path";

type HookBlockReason = typeof hookBlockReason;

const CLI_FILE_NAME = "readonly-shell.mts";
const MODULE = "../qa/readonly-shell.mts";
const GUARDED_AGENTS = ["qa-reviewer", "qa-explorer", "qa-coverage", "qa-judge", "qa-healer"];
const STDIN = 0;
const BLOCK_EXIT_CODE = 2;

function readStdin(): string {
  try {
    return readFileSync(STDIN, "utf8");
  } catch {
    return "";
  }
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function guardedAgentOf(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null || !("agent_type" in input)) {
    return undefined;
  }
  const agent = input.agent_type;
  if (typeof agent !== "string") {
    return undefined;
  }
  return GUARDED_AGENTS.includes(agent.split(":").pop() ?? "") ? agent : undefined;
}

function block(reason: string): void {
  process.stderr.write(`${reason}\n`);
  process.exitCode = BLOCK_EXIT_CODE;
}

async function main(): Promise<void> {
  const input = parse(readStdin());
  const agent = guardedAgentOf(input);
  if (agent === undefined) {
    return;
  }
  try {
    const shell: { hookBlockReason: HookBlockReason } = await import(MODULE);
    const reason = shell.hookBlockReason(input, process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd());
    if (reason !== undefined) {
      block(reason);
    }
  } catch {
    block(`${agent} is restricted and its check could not run; blocked`);
  }
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  await main();
}
