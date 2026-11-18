import { execFileSync } from "node:child_process";
import { basename } from "node:path";

export type ChangedExpectation = { file: string; line: string };

type Hunk = { old: number; added: number };

const CLI_FILE_NAME = "expectation-guard.mts";
const BASE_FLAG = "--base=";
const DEFAULT_BASE = "HEAD";
const USAGE = "expectation-guard: usage is node qa/expectation-guard.mts [--base=<commit-ish>]";
const FINDING_EXIT_CODE = 1;
const ERROR_EXIT_CODE = 2;
const CONTEXT_LINES = 20;
const MAX_BUFFER = 256 * 1024 * 1024;
const NO_FILE = "/dev/null";
const SPEC_FILE = /\.(?:spec|test)\.[cm]?ts$/;
const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;
const PATH_PREFIX = /^[ab]\//;
const PATH_SUFFIX = /\t.*$/;
const STRING_LITERAL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const OPENERS = new Set(["(", "[", "{"]);
const CLOSERS = new Set([")", "]", "}"]);
const EXPECTATION = [
  /\bexpect\s*(?:\.\s*\w+\s*)?\(/,
  /\.\s*to(?:Be|Equal|StrictEqual|Have|Match|Contain|Throw|Satisfy)\w*\s*\(/,
  /\bassert\s*:/,
  /\bassert\s*(?:\.\s*\w+\s*)?\(/,
  /expected\w*\s*[:=]/i,
];

function holdsExpectation(text: string): boolean {
  return EXPECTATION.some((pattern) => pattern.test(text));
}

function bracketBalance(text: string): number {
  let balance = 0;
  for (const character of text.replace(STRING_LITERAL, "")) {
    if (OPENERS.has(character)) {
      balance += 1;
    } else if (CLOSERS.has(character)) {
      balance -= 1;
    }
  }
  return balance;
}

function pathOf(header: string): string {
  const path = header.replace(PATH_SUFFIX, "").replace(/^"|"$/g, "");
  return path === NO_FILE ? "" : path.replace(PATH_PREFIX, "");
}

function countOf(text: string | undefined): number {
  return text === undefined ? 1 : Number(text);
}

function withoutCarriageReturn(text: string): string {
  return text.endsWith("\r") ? text.slice(0, -1) : text;
}

/**
 * Finds every removed or changed line in a spec that holds an expectation: an `expect(` call, a `toBe…`, `toEqual`,
 * `toHave…` style matcher, an `assert:` step, or an `expected…` value; a line inside a multi-line expectation counts
 * too. Added lines are never findings, and neither is any file that is not a spec.
 */
export function findChangedExpectations(diff: string): ChangedExpectation[] {
  const findings: ChangedExpectation[] = [];
  let oldPath = "";
  let file = "";
  let hunk: Hunk = { old: 0, added: 0 };
  let depth = 0;
  for (const raw of diff.split("\n")) {
    if (hunk.old > 0 || hunk.added > 0) {
      const marker = raw.charAt(0);
      if (marker === "\\") {
        continue;
      }
      const text = raw.slice(1);
      const removed = marker === "-";
      if (marker !== "+") {
        hunk = { old: hunk.old - 1, added: marker === " " || raw === "" ? hunk.added - 1 : hunk.added };
        const starts = holdsExpectation(text);
        if (removed && SPEC_FILE.test(file) && (starts || depth > 0)) {
          findings.push({ file, line: withoutCarriageReturn(text) });
        }
        depth = starts || depth > 0 ? Math.max(0, depth + bracketBalance(text)) : 0;
      } else {
        hunk = { old: hunk.old, added: hunk.added - 1 };
      }
      continue;
    }
    const header = HUNK_HEADER.exec(raw);
    if (header !== null) {
      hunk = { old: countOf(header[1]), added: countOf(header[2]) };
      depth = 0;
    } else if (raw.startsWith("--- ")) {
      oldPath = pathOf(raw.slice(4));
    } else if (raw.startsWith("+++ ")) {
      file = pathOf(raw.slice(4)) || oldPath;
    }
  }
  return findings;
}

function parseBase(args: readonly string[]): string {
  let base = DEFAULT_BASE;
  for (const arg of args) {
    if (!arg.startsWith(BASE_FLAG)) {
      throw new Error(USAGE);
    }
    base = arg.slice(BASE_FLAG.length);
    if (base === "" || base.startsWith("-")) {
      throw new Error(`expectation-guard: ${arg} is not a commit-ish`);
    }
  }
  return base;
}

function runGit(args: readonly string[]): string {
  return execFileSync(
    "git",
    ["-c", "core.quotepath=off", "-c", "diff.noprefix=false", "-c", "diff.mnemonicPrefix=false", ...args],
    {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
}

function resolveBase(base: string): string {
  try {
    return runGit(["rev-parse", "--verify", "--quiet", `${base}^{commit}`]).trim();
  } catch {
    throw new Error(`expectation-guard: ${base} is not a commit in this repository`);
  }
}

function diffAgainst(commit: string): string {
  try {
    return runGit(["diff", `--unified=${CONTEXT_LINES}`, "--no-color", "--no-ext-diff", "--no-textconv", commit, "--"]);
  } catch {
    throw new Error("expectation-guard: git diff failed");
  }
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const base = parseBase(process.argv.slice(2));
    const findings = findChangedExpectations(diffAgainst(resolveBase(base)));
    if (findings.length === 0) {
      process.stdout.write("expectation-guard: ok\n");
    } else {
      const lines = findings.map((finding) => `${finding.file}: ${finding.line.trim()}`);
      process.stdout.write(
        `expectation-guard: ${findings.length} changed expectation(s) since ${base}\n${lines.join("\n")}\n`,
      );
      process.exitCode = FINDING_EXIT_CODE;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = ERROR_EXIT_CODE;
  }
}
