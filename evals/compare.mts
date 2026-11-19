import type { EvalResult } from "./case.mts";

import { readFileSync } from "node:fs";
import { basename } from "node:path";

export type Comparison = { blocking: string[]; judgeDrops: string[] };

const CLI_FILE_NAME = "compare.mts";
const USAGE = "evals: usage is node evals/compare.mts <previous.json> <current.json>";

/**
 * Compares a release's results with the previous release's. A failed code check of the current run blocks, whatever
 * the previous run did. A judge criterion that passed before and now fails, or is no longer answered, is a drop: it is
 * reported to a person and does not block. A case the previous run did not have has no drop.
 */
export function compareResults(previous: readonly EvalResult[], current: readonly EvalResult[]): Comparison {
  const before = new Map(previous.map((result) => [result.caseId, result]));
  const blocking = current.flatMap((result) =>
    Object.entries(result.codeChecks)
      .filter(([, passed]) => !passed)
      .map(([check]) => `${result.caseId}: ${check}`),
  );
  const judgeDrops = current.flatMap((result) => {
    const earlier = before.get(result.caseId);
    if (earlier === undefined) {
      return [];
    }
    return Object.entries(earlier.judge)
      .filter(([criterion, passed]) => passed && result.judge[criterion] !== true)
      .map(([criterion]) => `${result.caseId}: ${criterion}`);
  });
  return { blocking, judgeDrops };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleans(value: unknown): Record<string, boolean> {
  return isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([key, item]) => (typeof item === "boolean" ? [[key, item]] : [])),
      )
    : {};
}

/**
 * Reads a results file.
 *
 * @throws Error when the file cannot be read or is not a list of results.
 */
export function readResults(file: string): EvalResult[] {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`evals: ${file} cannot be read as JSON`);
  }
  if (!Array.isArray(json)) {
    throw new Error(`evals: ${file} is not a list of results`);
  }
  return json.map((entry, index) => {
    if (!isRecord(entry) || typeof entry["caseId"] !== "string") {
      throw new Error(`evals: ${file}: entry ${index} has no caseId`);
    }
    return {
      caseId: entry["caseId"],
      codeChecks: booleans(entry["codeChecks"]),
      judge: booleans(entry["judge"]),
      evidence: typeof entry["evidence"] === "string" ? entry["evidence"] : "",
    };
  });
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const [previousFile, currentFile] = process.argv.slice(2);
    if (previousFile === undefined || currentFile === undefined) {
      throw new Error(USAGE);
    }
    const { blocking, judgeDrops } = compareResults(readResults(previousFile), readResults(currentFile));
    for (const line of blocking) {
      process.stdout.write(`blocking: ${line}\n`);
    }
    for (const line of judgeDrops) {
      process.stdout.write(`judge drop (for a person to look at): ${line}\n`);
    }
    if (blocking.length === 0 && judgeDrops.length === 0) {
      process.stdout.write("ok\n");
    }
    process.exitCode = blocking.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
