import type { ProjectFacts } from "./project-facts.mts";

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { PROJECT_FACTS_PATH, parseProjectFacts } from "./project-facts.mts";

export type ChangedExpectation = { file: string; line: string };

type Hunk = { old: number; added: number };

type DiffLine = { file: string; marker: string; text: string; first: boolean };

const CLI_FILE_NAME = "expectation-guard.mts";
const BASE_FLAG = "--base=";
const SNAPSHOT_FLAG = "--snapshot";
const DEFAULT_BASE = "HEAD";
const USAGE = "expectation-guard: usage is node qa/expectation-guard.mts [--base=<tree-ish> | --snapshot]";
const FINDING_EXIT_CODE = 1;
const ERROR_EXIT_CODE = 2;
const WHOLE_FILE_CONTEXT = 100_000;
const MAX_BUFFER = 256 * 1024 * 1024;
const NO_FILE = "/dev/null";
const TEMP_PREFIX = "expectation-guard-index-";
const OUTSIDE_PREFIX = "outside healer paths: ";
const ADDED_PREFIX = "added ";
const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;
const PATH_PREFIX = /^[ab]\//;
const PATH_SUFFIX = /\t.*$/;
const TRAILING_SLASHES = /\/+$/;
const STRING_LITERAL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const OPENERS = new Set(["(", "[", "{"]);
const CLOSERS = new Set([")", "]", "}"]);
const EXPECTATION = [
  /\bexpect\w*\s*[.(]/,
  /\.(?:expect|verify|assert)\w*\s*\(/,
  /\.\s*to(?:Be|Equal|StrictEqual|Have|Match|Contain|Throw|Satisfy)\w*\s*\(/,
  /\bassert\s*:/,
  /\bassert\s*(?:\.\s*\w+\s*)?\(/,
  /expected\w*\s*[:=]/i,
];
const SUPPRESSION = [
  /\btest\.(?:skip|fixme|fail|slow|setTimeout)\b/,
  /\bdescribe\.(?:skip|fixme|fail|slow|configure)\b/,
  /\bwaitForTimeout\b/,
  /networkidle/,
  /\bexpect\.(?:extend|poll|configure)\b/,
  /\bcatch\s*\{/,
  /\.catch\(\s*\(\s*\)\s*=>/,
  /\bprocess\.exit\b/,
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

function diffLines(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldPath = "";
  let file = "";
  let hunk: Hunk = { old: 0, added: 0 };
  let first = false;
  for (const raw of diff.split("\n")) {
    if (hunk.old > 0 || hunk.added > 0) {
      const marker = raw.charAt(0);
      if (marker === "\\") {
        continue;
      }
      if (marker === "+") {
        hunk = { old: hunk.old, added: hunk.added - 1 };
      } else {
        hunk = { old: hunk.old - 1, added: marker === " " || raw === "" ? hunk.added - 1 : hunk.added };
      }
      lines.push({ file, marker, text: withoutCarriageReturn(raw.slice(1)), first });
      first = false;
      continue;
    }
    const header = HUNK_HEADER.exec(raw);
    if (header !== null) {
      hunk = { old: countOf(header[1]), added: countOf(header[2]) };
      first = true;
    } else if (raw.startsWith("--- ")) {
      oldPath = pathOf(raw.slice(4));
    } else if (raw.startsWith("+++ ")) {
      file = pathOf(raw.slice(4)) || oldPath;
    }
  }
  return lines;
}

/**
 * Finds every removed or changed line, in any file, that holds an expectation: an `expect…` call or helper, a
 * `.expect…`, `.verify…` or `.assert…` method call, a `toBe…`, `toEqual`, `toHave…` style matcher, an `assert:` step,
 * or an `expected…` value; a line inside a multi-line expectation counts too. Added lines are never findings here.
 * Give it a diff with the whole file as context (`--unified=100000`) so the start of a long expectation is seen.
 */
export function findChangedExpectations(diff: string): ChangedExpectation[] {
  const findings: ChangedExpectation[] = [];
  let depth = 0;
  for (const { file, marker, text, first } of diffLines(diff)) {
    if (marker === "+") {
      continue;
    }
    if (first) {
      depth = 0;
    }
    const starts = holdsExpectation(text);
    if (marker === "-" && (starts || depth > 0)) {
      findings.push({ file, line: text });
    }
    depth = starts || depth > 0 ? Math.max(0, depth + bracketBalance(text)) : 0;
  }
  return findings;
}

/**
 * Finds every added line, in any file, that switches a check off or hides a failure: `test.skip|fixme|fail|slow|
 * setTimeout`, `describe.skip|fixme|fail|slow|configure`, `waitForTimeout`, `networkidle`, `expect.extend|poll|
 * configure`, an empty-handed `catch {` or `.catch(() =>`, and `process.exit`. A bare `return` or `throw` is too
 * common to flag.
 */
export function findAddedSuppressions(diff: string): ChangedExpectation[] {
  return diffLines(diff)
    .filter(({ marker, text }) => marker === "+" && SUPPRESSION.some((pattern) => pattern.test(text)))
    .map(({ file, text }) => ({ file, line: text }));
}

/**
 * Returns the files that are not under one of the healer paths: a path is a directory prefix, with or without its
 * trailing slash, and `pages` does not allow `pages-extra/`. A file that is not allowed is a finding whatever it holds.
 */
export function findOutsideHealerPaths(files: readonly string[], healerPaths: readonly string[]): string[] {
  const allowed = healerPaths.map((path) => path.replace(TRAILING_SLASHES, ""));
  return files.filter((file) => !allowed.some((path) => file === path || file.startsWith(`${path}/`)));
}

type Mode = { kind: "snapshot" } | { kind: "compare"; base: string };

function parseMode(args: readonly string[]): Mode {
  let base: string | undefined;
  let snapshot = false;
  for (const arg of args) {
    if (arg === SNAPSHOT_FLAG) {
      snapshot = true;
    } else if (arg.startsWith(BASE_FLAG)) {
      base = arg.slice(BASE_FLAG.length);
      if (base === "" || base.startsWith("-")) {
        throw new Error(`expectation-guard: ${arg} is not a tree-ish`);
      }
    } else {
      throw new Error(USAGE);
    }
  }
  if (snapshot) {
    if (base !== undefined) {
      throw new Error(USAGE);
    }
    return { kind: "snapshot" };
  }
  return { kind: "compare", base: base ?? DEFAULT_BASE };
}

function runGit(args: readonly string[], index?: string): string {
  return execFileSync(
    "git",
    [
      "-c",
      "core.quotepath=off",
      "-c",
      "core.safecrlf=false",
      "-c",
      "diff.noprefix=false",
      "-c",
      "diff.mnemonicPrefix=false",
      ...args,
    ],
    {
      encoding: "utf8",
      maxBuffer: MAX_BUFFER,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", ...(index === undefined ? {} : { GIT_INDEX_FILE: index }) },
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
}

/**
 * Writes the working tree, untracked files included and ignored files left out, as a git tree object through a
 * throw-away index. The repository's own index, branch and files are not touched.
 */
function snapshotTree(): string {
  const directory = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
  try {
    const index = join(directory, "index");
    runGit(["add", "-A", "--", ":/"], index);
    return runGit(["write-tree"], index).trim();
  } catch {
    throw new Error("expectation-guard: the working tree could not be snapshotted");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function resolveTree(base: string): string {
  try {
    return runGit(["rev-parse", "--verify", "--quiet", `${base}^{tree}`]).trim();
  } catch {
    throw new Error(`expectation-guard: ${base} is not a tree or commit in this repository`);
  }
}

function baselineFacts(baseTree: string): ProjectFacts {
  let text: string;
  try {
    text = runGit(["show", `${baseTree}:${PROJECT_FACTS_PATH}`]);
  } catch {
    throw new Error(`project.json: ${PROJECT_FACTS_PATH} cannot be read in the baseline`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`project.json: ${PROJECT_FACTS_PATH} is not valid JSON in the baseline`);
  }
  return parseProjectFacts(json);
}

function changedFiles(base: string, current: string): string[] {
  try {
    return runGit(["diff", "--name-only", "-z", "--no-renames", "--no-ext-diff", base, current, "--"])
      .split("\0")
      .filter((file) => file !== "");
  } catch {
    throw new Error("expectation-guard: git diff failed");
  }
}

function diffTrees(base: string, current: string): string {
  try {
    return runGit([
      "diff",
      `--unified=${WHOLE_FILE_CONTEXT}`,
      "--no-renames",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      base,
      current,
      "--",
    ]);
  } catch {
    throw new Error("expectation-guard: git diff failed");
  }
}

function guard(base: string): string[] {
  const baseTree = resolveTree(base);
  const healerPaths = baselineFacts(baseTree).healerPaths;
  const currentTree = snapshotTree();
  const diff = diffTrees(baseTree, currentTree);
  const outside = findOutsideHealerPaths(changedFiles(baseTree, currentTree), healerPaths).map(
    (file) => `${OUTSIDE_PREFIX}${file}`,
  );
  const expectations = findChangedExpectations(diff).map(({ file, line }) => `${file}: ${line.trim()}`);
  const suppressions = findAddedSuppressions(diff).map(({ file, line }) => `${file}: ${ADDED_PREFIX}${line.trim()}`);
  return [...outside, ...expectations, ...suppressions];
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const mode = parseMode(process.argv.slice(2));
    if (mode.kind === "snapshot") {
      process.stdout.write(`${snapshotTree()}\n`);
    } else {
      const findings = guard(mode.base);
      if (findings.length === 0) {
        process.stdout.write("expectation-guard: ok\n");
      } else {
        process.stdout.write(
          `expectation-guard: ${findings.length} finding(s) since ${mode.base}\n${findings.join("\n")}\n`,
        );
        process.exitCode = FINDING_EXIT_CODE;
      }
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = ERROR_EXIT_CODE;
  }
}
