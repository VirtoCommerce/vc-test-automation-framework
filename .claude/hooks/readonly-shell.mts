import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { hookBlockReason } from "../../qa/readonly-shell.mts";

const CLI_FILE_NAME = "readonly-shell.mts";
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

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  const reason = hookBlockReason(parse(readStdin()));
  if (reason !== undefined) {
    process.stderr.write(`${reason}\n`);
    process.exitCode = BLOCK_EXIT_CODE;
  }
}
