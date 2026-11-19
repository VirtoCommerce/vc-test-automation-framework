import type { ProjectFacts } from "./project-facts.mts";

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { PROJECT_FACTS_PATH, parseProjectFacts } from "./project-facts.mts";

export type ChangedExpectation = { file: string; line: string };

type Hunk = { old: number; added: number };

type DiffLine = { file: string; marker: string; text: string; first: boolean };

const CLI_FILE_NAME = "expectation-guard.mts";
const BASE_FLAG = "--base=";
const SNAPSHOT_FLAG = "--snapshot";
const FINGERPRINT_FLAG = "--repo-fingerprint";
const DEFAULT_BASE = "HEAD";
const USAGE =
  "expectation-guard: usage is node .claude/checks/expectation-guard.mts [--base=<tree-ish> | --snapshot | --repo-fingerprint]";
const FILTER_SECTION = "filter";
const FILTER_SETTINGS = ["clean", "smudge", "process"];
const HOOK_SECTION = "hook";
const HOOK_EVENTS = ["post-index-change"];
const FINGERPRINT_DIRS = ["info", "hooks"];
const MISSING = "missing";
const FINDING_EXIT_CODE = 1;
const ERROR_EXIT_CODE = 2;
const WHOLE_FILE_CONTEXT = 100_000;
const MAX_BUFFER = 256 * 1024 * 1024;
const NO_FILE = "/dev/null";
const TEMP_PREFIX = "expectation-guard-index-";
const OUTSIDE_PREFIX = "outside healer paths: ";
const FILE_ORIGIN = "file:";
const INCLUDE_PATH_KEYS = "^include(if\\..*)?\\.path$";
const NO_MATCH_EXIT_CODE = 1;
const HOME_PREFIX = /^~[/\\]/;
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
  /\btest\s*\.\s*(?:skip|fixme|fail|slow|setTimeout)\b/,
  /\bdescribe\s*\.\s*(?:skip|fixme|fail|slow|configure)\b/,
  /\b(?:testInfo|test\s*\.\s*info\s*\(\s*\))\s*\.\s*(?:skip|fixme|fail)\b/,
  /["'`](?:node:)?(?:fs|child_process)(?:\/promises)?["'`]/,
  /\brequire\s*[.(]/,
  /\bimport\s*\(/,
  /\bprocess\s*(?:\.\s*env\b|\[)/,
  /\b(?:writeFileSync|appendFileSync|rmSync|unlinkSync|execSync|spawn\w*)\b/,
  /\bwaitForTimeout\b/,
  /networkidle/,
  /\bexpect\.(?:extend|poll|configure)\b/,
  /\bcatch\s*\{/,
  /\bcatch\s*\([^)]*\)\s*\{\s*\}/,
  /\.catch\(\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/,
  /\.catch\(\s*noop\b/,
  /\bsetTimeout\s*\(/,
  /\bforce\s*:\s*true\b/,
  /\b(?:test|describe)(?:\.\w+)*\s*\[\s*["'`](?:skip|fixme|fail|slow|setTimeout|configure)["'`]\s*\]/,
  /\b(?:retries|timeout)\s*:/,
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
 * configure`, `testInfo.skip|fixme|fail` and `test.info().skip|fixme|fail`, an empty-handed `catch {` or
 * `.catch(() =>`, `process.exit`, a `setTimeout`, `force: true`, `retries:` or `timeout:`; and code that reaches past the
 * page: the `fs` and `child_process` modules, `require`, a dynamic `import(`, `process.env` and the file-writing and
 * process-spawning calls. A bare `return` or `throw` is too common to flag.
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

type Mode = { kind: "snapshot" } | { kind: "fingerprint" } | { kind: "compare"; base: string };

type Git = (args: readonly string[], index?: string) => string;

function parseMode(args: readonly string[]): Mode {
  let base: string | undefined;
  let snapshot = false;
  let fingerprint = false;
  for (const arg of args) {
    if (arg === SNAPSHOT_FLAG) {
      snapshot = true;
    } else if (arg === FINGERPRINT_FLAG) {
      fingerprint = true;
    } else if (arg.startsWith(BASE_FLAG)) {
      base = arg.slice(BASE_FLAG.length);
      if (base === "" || base.startsWith("-")) {
        throw new Error(`expectation-guard: ${arg} is not a tree-ish`);
      }
    } else {
      throw new Error(USAGE);
    }
  }
  if (Number(snapshot) + Number(fingerprint) + Number(base !== undefined) > 1) {
    throw new Error(USAGE);
  }
  if (snapshot) {
    return { kind: "snapshot" };
  }
  return fingerprint ? { kind: "fingerprint" } : { kind: "compare", base: base ?? DEFAULT_BASE };
}

function execGit(args: readonly string[], index?: string): string {
  return execFileSync(
    "git",
    [
      "--no-replace-objects",
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
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_ATTR_NOSYSTEM: "1",
        GIT_NO_LAZY_FETCH: "1",
        ...(index === undefined ? {} : { GIT_INDEX_FILE: index }),
      },
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
}

function configuredNames(git: Git, section: string): string[] {
  let keys: string;
  try {
    keys = git(["config", "--name-only", "--get-regexp", `^${section}\\.`]);
  } catch {
    return [];
  }
  const pattern = new RegExp(`^${section}\\.(.+)\\.[^.]+$`);
  const names = [...new Set(keys.split("\n").flatMap((key) => pattern.exec(key.trim())?.[1] ?? []))];
  if (names.some((name) => name.includes("="))) {
    throw new Error(`expectation-guard: a ${section} name holds '=' and cannot be switched off`);
  }
  return names;
}

function switchedOff(git: Git): string[] {
  const filters = configuredNames(git, FILTER_SECTION).flatMap((driver) => [
    ...FILTER_SETTINGS.flatMap((setting) => ["-c", `filter.${driver}.${setting}=`]),
    "-c",
    `filter.${driver}.required=false`,
  ]);
  const hooks = [...HOOK_EVENTS, ...configuredNames(git, HOOK_SECTION)].flatMap((name) => [
    "-c",
    `hook.${name}.enabled=false`,
    "-c",
    `hook.${name}.command=`,
  ]);
  return [...filters, ...hooks];
}

/**
 * Runs `work` with a git that reads the repository and runs no command the repository or the user configured, reads
 * no replace ref (`--no-replace-objects`) and fetches no missing object of a partial clone (`GIT_NO_LAZY_FETCH`): no
 * fsmonitor, hook scripts from an empty folder, every hook defined in the configuration (`hook.<name>.command`) and
 * the hook events the guard's own commands raise disabled, no global or system attributes file, and every filter
 * driver git knows switched off, so a planted `.git/config` or `.git/info/attributes` cannot run a command or rewrite
 * what is hashed. The temporary folder also holds the throw-away index and is removed afterwards.
 */
function withSafeGit<T>(work: (git: Git, scratch: string) => T): T {
  const scratch = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
  try {
    const hooks = join(scratch, "hooks");
    mkdirSync(hooks);
    const safety = [
      "-c",
      "core.fsmonitor=false",
      "-c",
      `core.hooksPath=${hooks}`,
      "-c",
      `core.attributesFile=${join(scratch, "none")}`,
    ];
    const off = switchedOff((args, index) => execGit([...safety, ...args], index));
    return work((args, index) => execGit([...safety, ...off, ...args], index), scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Writes the working tree, untracked files included and ignored files left out, as a git tree object through a
 * throw-away index. The repository's own index, branch and files are not touched.
 */
function snapshotTree(git: Git, scratch: string): string {
  try {
    const index = join(scratch, "index");
    git(["add", "-A", "--", ":/"], index);
    return git(["write-tree"], index).trim();
  } catch {
    throw new Error("expectation-guard: the working tree could not be snapshotted");
  }
}

function resolveTree(git: Git, base: string): string {
  try {
    return git(["rev-parse", "--verify", "--quiet", `${base}^{tree}`]).trim();
  } catch {
    throw new Error(`expectation-guard: ${base} is not a tree or commit in this repository`);
  }
}

function baselineFacts(git: Git, baseTree: string): ProjectFacts {
  let text: string;
  try {
    text = git(["show", `${baseTree}:${PROJECT_FACTS_PATH}`]);
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

function changedFiles(git: Git, base: string, current: string): string[] {
  try {
    return git(["diff", "--name-only", "-z", "--no-renames", "--no-ext-diff", base, current, "--"])
      .split("\0")
      .filter((file) => file !== "");
  } catch {
    throw new Error("expectation-guard: git diff failed");
  }
}

function diffTrees(git: Git, base: string, current: string): string {
  try {
    return git([
      "diff",
      `--unified=${WHOLE_FILE_CONTEXT}`,
      "--no-renames",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--text",
      base,
      current,
      "--",
    ]);
  } catch {
    throw new Error("expectation-guard: git diff failed");
  }
}

function guard(git: Git, scratch: string, base: string): string[] {
  const baseTree = resolveTree(git, base);
  const healerPaths = baselineFacts(git, baseTree).healerPaths;
  const currentTree = snapshotTree(git, scratch);
  const diff = diffTrees(git, baseTree, currentTree);
  const outside = findOutsideHealerPaths(changedFiles(git, baseTree, currentTree), healerPaths).map(
    (file) => `${OUTSIDE_PREFIX}${file}`,
  );
  const expectations = findChangedExpectations(diff).map(({ file, line }) => `${file}: ${line.trim()}`);
  const suppressions = findAddedSuppressions(diff).map(({ file, line }) => `${file}: ${ADDED_PREFIX}${line.trim()}`);
  return [...outside, ...expectations, ...suppressions];
}

function contentHash(path: string): string {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return MISSING;
  }
}

function fingerprintEntries(label: string, path: string): string[] {
  let names: string[];
  try {
    if (!statSync(path).isDirectory()) {
      return [`${label}\0${contentHash(path)}`];
    }
    names = readdirSync(path).sort();
  } catch {
    return [`${label}\0${MISSING}`];
  }
  return [`${label}/\0dir`, ...names.flatMap((name) => fingerprintEntries(`${label}/${name}`, join(path, name)))];
}

function configuredHooksFolder(): string {
  try {
    return execGit(["-c", "core.fsmonitor=false", "rev-parse", "--path-format=absolute", "--git-path", "hooks"]).trim();
  } catch {
    throw new Error("expectation-guard: the hooks folder cannot be resolved");
  }
}

/**
 * The real path of the deepest part of `path` that exists, with the rest appended, so a file that does not exist yet
 * is still compared through the real folders above it.
 */
function canonical(path: string): string {
  const rest: string[] = [];
  let existing = path;
  for (;;) {
    try {
      return join(realpathSync.native(existing), ...rest);
    } catch {
      const parent = dirname(existing);
      if (parent === existing) {
        return path;
      }
      rest.unshift(basename(existing));
      existing = parent;
    }
  }
}

function isUnder(path: string, directory: string): boolean {
  const inside = relative(directory.toLowerCase(), path.toLowerCase());
  return inside === "" || !(inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside));
}

function exitStatus(error: unknown): unknown {
  return typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
}

function originFolder(top: string, origin: string): string {
  return origin.startsWith(FILE_ORIGIN) ? dirname(resolve(top, origin.slice(FILE_ORIGIN.length))) : top;
}

/**
 * The files every `include.path` and `includeIf.<condition>.path` names, resolved the way git does: relative to the
 * folder of the configuration file that holds it, `~/` from the home folder. A target is listed whether or not it
 * exists or holds anything, since the healer could create or fill it. Git runs in `top` (`-C`), so a relative origin
 * it prints is relative to `top` wherever the guard itself was started.
 */
function includeTargets(git: Git, top: string): string[] {
  let listing = "";
  try {
    listing = git(["-C", top, "config", "--show-origin", "-z", "--get-regexp", INCLUDE_PATH_KEYS]);
  } catch (error) {
    if (exitStatus(error) !== NO_MATCH_EXIT_CODE) {
      throw new Error("expectation-guard: git config --get-regexp for the include paths failed");
    }
  }
  const fields = listing.split("\0");
  const targets: string[] = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const entry = fields[index + 1] ?? "";
    const newline = entry.indexOf("\n");
    if (newline < 0) {
      continue;
    }
    const value = entry.slice(newline + 1);
    const home = process.env["HOME"] ?? homedir();
    targets.push(
      HOME_PREFIX.test(value) ? join(home, value.slice(2)) : resolve(originFolder(top, fields[index] ?? ""), value),
    );
  }
  return targets;
}

/**
 * Returns the configuration files git reads (`git config --list --show-origin`, includes followed) and the targets of
 * every include path (`includeTargets`) that lie under one of the healer paths of the facts file in the working tree,
 * compared by real path (`isUnder`). Git runs in `top` (`-C`), so the relative origins it prints resolve against `top`
 * even when the guard runs from a subfolder. The healer may write there, so such a file could change the
 * configuration without changing the fingerprint.
 */
function configFilesUnderHealerPaths(git: Git, top: string): string[] {
  let facts: ProjectFacts;
  try {
    facts = parseProjectFacts(JSON.parse(readFileSync(join(top, PROJECT_FACTS_PATH), "utf8")));
  } catch (error) {
    throw new Error(`expectation-guard: ${error instanceof Error ? error.message : String(error)}`);
  }
  let listing: string;
  try {
    listing = git(["-C", top, "config", "--list", "--show-origin", "--name-only", "-z"]);
  } catch {
    throw new Error("expectation-guard: git config --list --show-origin failed");
  }
  const origins = listing
    .split("\0")
    .filter((field, index) => index % 2 === 0 && field.startsWith(FILE_ORIGIN))
    .map((field) => resolve(top, field.slice(FILE_ORIGIN.length)));
  const files = [...new Set([...origins, ...includeTargets(git, top)])];
  const healerDirs = facts.healerPaths.map((path) => canonical(resolve(top, path.replace(TRAILING_SLASHES, ""))));
  return files.filter((file) => healerDirs.some((directory) => isUnder(canonical(file), directory)));
}

/**
 * Hashes `.git/config`, `config.worktree`, every file under `.git/info/` and `.git/hooks/`, every file in the folder
 * git runs hooks from (`core.hooksPath`, wherever it points), and `.qa/project.json` into one sha256, missing files
 * included, so adding a hook or a config line changes it. Refuses, as an error, when git reads a configuration file
 * under a healer path (`configFilesUnderHealerPaths`), since the healer could change that file unseen. Reads only.
 */
function repoFingerprint(git: Git): string {
  let paths: string[];
  try {
    paths = git(["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir", "--show-toplevel"])
      .split("\n")
      .map((line) => line.trim());
  } catch {
    throw new Error("expectation-guard: not inside a git repository");
  }
  const [gitDir = "", commonDir = "", top = ""] = paths;
  if (gitDir === "" || commonDir === "" || top === "") {
    throw new Error("expectation-guard: not inside a git repository");
  }
  const planted = configFilesUnderHealerPaths(git, top).map((file) => relative(top, file).split(sep).join("/"));
  if (planted.length > 0) {
    throw new Error(`expectation-guard: git reads configuration under a healer path: ${planted.join(", ")}`);
  }
  const entries = [
    ...fingerprintEntries("config", join(commonDir, "config")),
    ...fingerprintEntries("config.worktree", join(gitDir, "config.worktree")),
    ...FINGERPRINT_DIRS.flatMap((dir) => fingerprintEntries(dir, join(commonDir, dir))),
    ...fingerprintEntries("hooksPath", configuredHooksFolder()),
    ...fingerprintEntries(PROJECT_FACTS_PATH, join(top, PROJECT_FACTS_PATH)),
  ];
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const mode = parseMode(process.argv.slice(2));
    withSafeGit((git, scratch) => {
      if (mode.kind === "snapshot") {
        process.stdout.write(`${snapshotTree(git, scratch)}\n`);
        return;
      }
      if (mode.kind === "fingerprint") {
        process.stdout.write(`${repoFingerprint(git)}\n`);
        return;
      }
      const findings = guard(git, scratch, mode.base);
      if (findings.length === 0) {
        process.stdout.write("expectation-guard: ok\n");
      } else {
        process.stdout.write(
          `expectation-guard: ${findings.length} finding(s) since ${mode.base}\n${findings.join("\n")}\n`,
        );
        process.exitCode = FINDING_EXIT_CODE;
      }
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = ERROR_EXIT_CODE;
  }
}
