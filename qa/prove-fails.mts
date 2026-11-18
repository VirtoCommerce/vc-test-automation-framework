import { execFile } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export type ProveFailsResult = { failed: boolean; output: string };

type TestRef = { project: string; title: string; line: number };

type Outcome = { status: string; messages: string[] };

const CLI_FILE_NAME = "prove-fails.mts";
const JUDGE_DIR = ".qa/judge";
const TEMP_PREFIX = "prove-fails-";
const PLAYWRIGHT_CLI = ["node_modules", "@playwright", "test", "cli.js"];
const RUN_TIMEOUT_MS = 600_000;
const MAX_BUFFER = 64 * 1024 * 1024;
const MAX_OUTPUT = 3000;
const MAX_PROBLEM = 300;
const PROJECT_FLAG = /^--project=([\w.-]+)$/;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const NUMSTAT_ROW = /^(?:\d+|-)\t(?:\d+|-)\t(.*)$/;
const ENV_FILE = /^\.env(\..+)?$/;
const ENV_EXAMPLE = ".env.example";
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;
const GIT_HEADER_LINE = /^index [0-9a-f]+\.\.[0-9a-f]+/;
const APPLY_FLAGS = ["--recount", "--unidiff-zero"];
const LITERAL_MASK = "0";
const LITERAL = new RegExp(
  [
    String.raw`"(?:[^"\\\n]|\\.)*"`,
    String.raw`'(?:[^'\\\n]|\\.)*'`,
    String.raw`(?<![\w$)\]])\x60(?:[^\x60\\$]|\\.|\$(?!\{))*\x60`,
    String.raw`\b(?:0[xX][0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)n?\b`,
  ].join("|"),
  "g",
);
const UNSAFE_LINE = new RegExp(
  [
    String.raw`\b(?:import|require|eval|Function|process|globalThis|child_process|getBuiltinModule|fetch|fork|symlink\w*|chmod\w*)\b`,
    String.raw`\b(?:exec|spawn|write|unlink|rm|rename|copy|append|mkdir)\w*`,
    String.raw`\bfrom\s*["'\x60]`,
    String.raw`\.(?:post|put|patch|delete)\s*\(`,
  ].join("|"),
);
const ASSERTION_LINE = /\bexpect\b|\.to[A-Z]\w*\s*\(/;

function problem(text: string): Error {
  return new Error(`prove-fails: ${text}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstLine(text: string): string {
  return (text.trim().split("\n")[0] ?? "").trim().slice(0, MAX_PROBLEM);
}

function normalize(path: string): string {
  return path.replaceAll("\\", "/");
}

function isInside(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

function quietly(action: () => void): void {
  try {
    action();
  } catch {
    return;
  }
}

function run(
  file: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ stdout: string; stderr: string; failed: boolean }> {
  return new Promise((done) => {
    execFile(
      file,
      [...args],
      { cwd, env, timeout: RUN_TIMEOUT_MS, maxBuffer: MAX_BUFFER, encoding: "utf8", windowsHide: true },
      (error, stdout, stderr) => {
        done({ stdout, stderr, failed: error !== null });
      },
    );
  });
}

async function git(args: readonly string[], cwd: string): Promise<string> {
  const result = await run("git", args, cwd);
  if (result.failed) {
    throw problem(`git ${args[0] ?? ""} failed: ${firstLine(result.stderr)}`);
  }
  return result.stdout;
}

function maskLiterals(line: string): string {
  return line.replace(LITERAL, LITERAL_MASK);
}

function isLiteralReplacement(from: string, to: string): boolean {
  const masked = maskLiterals(from);
  if (masked !== maskLiterals(to) || UNSAFE_LINE.test(masked)) {
    return false;
  }
  return !masked.includes("(") || ASSERTION_LINE.test(masked);
}

function replaceOnly(why: string): Error {
  return problem(`the patch may only replace one string or number literal with another, line for line (${why})`);
}

function checkHeader(lines: readonly string[], spec: string): number {
  const allowed = [`diff --git a/${spec} b/${spec}`, `--- a/${spec}`, `+++ b/${spec}`];
  let index = 0;
  const seen = new Set<string>();
  while (index < lines.length && !(lines[index] ?? "").startsWith("@@")) {
    const line = lines[index] ?? "";
    if (allowed.includes(line)) {
      seen.add(line);
    } else if (!GIT_HEADER_LINE.test(line)) {
      throw problem(`the patch may touch only ${spec}`);
    }
    index += 1;
  }
  if (!seen.has(allowed[1] ?? "") || !seen.has(allowed[2] ?? "")) {
    throw problem(`the patch may touch only ${spec}`);
  }
  return index;
}

function checkHunks(lines: readonly string[], start: number): void {
  let removed: string[] = [];
  let added: string[] = [];
  const flush = (): void => {
    if (removed.length + added.length > 0) {
      const [from] = removed;
      const [to] = added;
      if (removed.length !== 1 || added.length !== 1 || from === undefined || to === undefined) {
        throw replaceOnly("a hunk adds or removes lines");
      }
      if (!isLiteralReplacement(from, to)) {
        throw replaceOnly("a line changes more than a literal, or is not a line a literal may change on");
      }
    }
    removed = [];
    added = [];
  };
  for (const line of lines.slice(start)) {
    const mark = line.charAt(0);
    if (HUNK_HEADER.test(line)) {
      flush();
    } else if (mark === " " || mark === "\\") {
      flush();
    } else if (mark === "-") {
      if (added.length > 0) {
        flush();
      }
      removed.push(line.slice(1));
    } else if (mark === "+") {
      added.push(line.slice(1));
    } else {
      throw replaceOnly("a line is not part of a hunk");
    }
  }
  flush();
}

function checkPatchText(text: string, spec: string): void {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const start = checkHeader(lines, spec);
  if (start >= lines.length) {
    throw problem("the patch has no hunk");
  }
  checkHunks(lines, start);
}

function targetsOf(numstat: string): string[] {
  const parts = numstat.split("\0");
  const targets: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const row = NUMSTAT_ROW.exec(parts[index] ?? "");
    if (row === null) {
      continue;
    }
    if ((row[1] ?? "") === "") {
      targets.push(parts[index + 1] ?? "", parts[index + 2] ?? "");
      index += 2;
    } else {
      targets.push(row[1] ?? "");
    }
  }
  return targets.filter((target) => target !== "");
}

async function checkedPatch(patchFile: string, root: string, spec: string): Promise<string> {
  const path = resolve(root, patchFile);
  if (!isInside(resolve(root, JUDGE_DIR), path)) {
    throw problem(`the patch must be inside ${JUDGE_DIR}`);
  }
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw problem(`the patch ${patchFile} cannot be read`);
  }
  checkPatchText(readFileSync(path, "utf8"), spec);
  const numstat = await run("git", ["apply", "--numstat", "-z", ...APPLY_FLAGS, path], root);
  if (numstat.failed) {
    throw problem(`the patch is not a valid patch: ${firstLine(numstat.stderr)}`);
  }
  const targets = targetsOf(numstat.stdout);
  if (targets.length !== 1 || normalize(targets[0] ?? "") !== spec) {
    throw problem(`the patch may touch only ${spec}`);
  }
  return path;
}

function checkedSpec(spec: string, root: string): string {
  const path = resolve(root, spec);
  if (isAbsolute(spec) || !isInside(root, path)) {
    throw problem(`${spec} is not a path inside the repository`);
  }
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw problem(`${spec} is not a file`);
  }
  return normalize(relative(root, path));
}

function copyInto(root: string, worktree: string, path: string): void {
  const source = join(root, path);
  const target = join(worktree, path);
  if (existsSync(source) && statSync(source).isFile()) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  } else {
    rmSync(target, { force: true });
  }
}

async function overlayWorkingTree(root: string, worktree: string, spec: string): Promise<void> {
  const changed = (await git(["diff", "--name-only", "--no-renames", "-z", "HEAD"], root)).split("\0");
  const untracked = (await git(["ls-files", "-z", "--others", "--exclude-standard"], root)).split("\0");
  for (const path of [...changed, ...untracked].filter((entry) => entry !== "")) {
    copyInto(root, worktree, path);
  }
  copyInto(root, worktree, spec);
}

function copyEnvFiles(root: string, worktree: string): void {
  for (const name of readdirSync(root)) {
    if (ENV_FILE.test(name) && name !== ENV_EXAMPLE && statSync(join(root, name)).isFile()) {
      copyFileSync(join(root, name), join(worktree, name));
    }
  }
}

function linkDependencies(root: string, worktree: string): void {
  const modules = join(root, "node_modules");
  if (existsSync(modules)) {
    symlinkSync(modules, join(worktree, "node_modules"), "junction");
  }
}

function isLinkAt(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function unlinkDependencies(worktree: string): boolean {
  const link = join(worktree, "node_modules");
  if (isLinkAt(link)) {
    quietly(() => {
      unlinkSync(link);
    });
  }
  return !isLinkAt(link);
}

/**
 * Removes a throw-away worktree: the link to `node_modules` first (the target stays), then the worktree itself.
 * Every step is separate and none throws, so a cleanup problem never hides the result or error of the run. When the
 * link cannot be removed nothing else is deleted.
 */
export async function removeWorktree(root: string, worktree: string): Promise<void> {
  if (!unlinkDependencies(worktree)) {
    return;
  }
  const removed = await run("git", ["worktree", "remove", "--force", worktree], root);
  if (removed.failed) {
    quietly(() => {
      rmSync(worktree, { recursive: true, force: true });
    });
  }
  await run("git", ["worktree", "prune"], root);
}

function escapeRegExp(text: string): string {
  return text.replace(REGEX_SPECIALS, "\\$&");
}

function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function walkSpecs(suite: unknown, visit: (spec: Record<string, unknown>) => void): void {
  if (!isRecord(suite)) {
    return;
  }
  for (const spec of Array.isArray(suite["specs"]) ? suite["specs"] : []) {
    if (isRecord(spec)) {
      visit(spec);
    }
  }
  for (const child of Array.isArray(suite["suites"]) ? suite["suites"] : []) {
    walkSpecs(child, visit);
  }
}

function entriesOf(
  report: unknown,
  visit: (spec: Record<string, unknown>, entry: Record<string, unknown>) => void,
): void {
  if (!isRecord(report)) {
    return;
  }
  for (const suite of Array.isArray(report["suites"]) ? report["suites"] : []) {
    walkSpecs(suite, (spec) => {
      for (const entry of Array.isArray(spec["tests"]) ? spec["tests"] : []) {
        if (isRecord(entry)) {
          visit(spec, entry);
        }
      }
    });
  }
}

function errorMessages(report: unknown): string[] {
  const messages: string[] = [];
  if (isRecord(report) && Array.isArray(report["errors"])) {
    for (const error of report["errors"]) {
      messages.push(stripAnsi(isRecord(error) ? textOf(error["message"]) : ""));
    }
  }
  return messages.filter((message) => message.trim() !== "");
}

async function playwright(
  worktree: string,
  args: readonly string[],
  reportFile: string,
): Promise<{ report: unknown; stderr: string }> {
  rmSync(reportFile, { force: true });
  const result = await run(
    process.execPath,
    [join(worktree, ...PLAYWRIGHT_CLI), "test", ...args, "--reporter=json"],
    worktree,
    { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile },
  );
  if (!existsSync(reportFile)) {
    throw problem(`Playwright wrote no report: ${firstLine(stripAnsi(result.stderr))}`);
  }
  try {
    return { report: JSON.parse(readFileSync(reportFile, "utf8")), stderr: result.stderr };
  } catch {
    throw problem("Playwright's report is not valid JSON");
  }
}

function listedTests(report: unknown, spec: string): TestRef[] {
  const refs: TestRef[] = [];
  entriesOf(report, (specEntry, entry) => {
    if (normalize(textOf(specEntry["file"])) === spec && typeof specEntry["line"] === "number") {
      refs.push({ project: textOf(entry["projectName"]), title: textOf(specEntry["title"]), line: specEntry["line"] });
    }
  });
  return refs;
}

function describeNone(spec: string, title: string, project: string | undefined): Error {
  const where = project === undefined ? "" : ` in project ${project}`;
  return problem(`no test titled "${title}" in ${spec}${where}`);
}

function resolveTest(report: unknown, spec: string, title: string, project: string | undefined): TestRef {
  const refs = listedTests(report, spec).filter((ref) => project === undefined || ref.project === project);
  const exact = refs.filter((ref) => ref.title === title);
  const matches = exact.length > 0 ? exact : refs.filter((ref) => ref.title.includes(title));
  const [first] = matches;
  if (first === undefined) {
    throw describeNone(spec, title, project);
  }
  const titles = [...new Set(matches.map((ref) => ref.title))];
  if (titles.length > 1) {
    throw problem(`"${title}" matches more than one test: ${titles.map((found) => `"${found}"`).join(", ")}`);
  }
  const projects = [...new Set(matches.map((ref) => ref.project))];
  if (projects.length > 1) {
    throw problem(`"${first.title}" is in projects ${projects.join(", ")}; pass the project`);
  }
  if (new Set(matches.map((ref) => ref.line)).size > 1) {
    throw problem(`"${first.title}" appears more than once in ${spec}`);
  }
  return first;
}

function outcomeOf(report: unknown, target: TestRef): Outcome {
  const found: Outcome[] = [];
  entriesOf(report, (specEntry, entry) => {
    if (specEntry["title"] !== target.title || entry["projectName"] !== target.project) {
      return;
    }
    const messages: string[] = [];
    for (const result of Array.isArray(entry["results"]) ? entry["results"] : []) {
      for (const error of isRecord(result) && Array.isArray(result["errors"]) ? result["errors"] : []) {
        messages.push(stripAnsi(isRecord(error) ? textOf(error["message"]) : ""));
      }
    }
    found.push({ status: textOf(entry["status"]), messages: messages.filter((message) => message.trim() !== "") });
  });
  const [only] = found;
  if (only === undefined || found.length > 1) {
    const why = found.length > 1 ? "ran more than once" : "did not run";
    throw problem(`the test "${target.title}" ${why}: ${firstLine(errorMessages(report).join(" "))}`);
  }
  return only;
}

async function runOnce(
  worktree: string,
  spec: string,
  target: TestRef,
  reportFile: string,
): Promise<{ failed: boolean; output: string }> {
  const args = [
    "--retries=0",
    `--project=${target.project}`,
    `--grep=${escapeRegExp(target.title)}$`,
    `${spec}:${target.line}`,
  ];
  const { report } = await playwright(worktree, args, reportFile);
  const outcome = outcomeOf(report, target);
  if (outcome.status === "expected") {
    return { failed: false, output: "the test passed" };
  }
  if (outcome.status === "unexpected") {
    return { failed: true, output: outcome.messages.join("\n---\n").slice(0, MAX_OUTPUT) };
  }
  const detail = firstLine(errorMessages(report).join(" "));
  throw problem(`the test "${target.title}" is ${outcome.status === "flaky" ? "flaky" : outcome.status}: ${detail}`);
}

/**
 * Proves that one test fails when a literal it checks is changed. Works on a throw-away git worktree in the system
 * temporary directory, outside the repository (the working tree is never touched): the worktree gets the
 * repository's `HEAD`, the working tree's uncommitted changes and the spec as it is on disk, a link to `node_modules`
 * and the `.env*` files; the test is run once as it is, with no retries, and must pass, then the patch is applied and
 * the same test run again.
 *
 * `failed` is true only when the test passed before the patch and failed after it. A flaky or skipped result is an
 * error, not a proof. The worktree is removed on every path, and the removal never hides the result or the error.
 *
 * @param spec repository-relative path of the spec file.
 * @param title the test's own title, or a part of it that matches exactly one test in the file.
 * @param patchFile a unified diff inside `.qa/judge/` that touches only `spec`, and in it replaces, line for line,
 * one string or number literal with another; any other change is refused.
 * @param project the Playwright project to run; resolved from the spec when omitted and the test is in one project.
 * @throws Error when an input is wrong, the patch is refused or does not apply, the test fails before the patch, is
 * flaky or does not run.
 */
export async function proveFails(
  spec: string,
  title: string,
  patchFile: string,
  project?: string,
): Promise<ProveFailsResult> {
  const root = resolve((await git(["rev-parse", "--show-toplevel"], process.cwd())).trim());
  const specPath = checkedSpec(spec, root);
  const patch = await checkedPatch(patchFile, root, specPath);
  const worktree = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
  try {
    await git(["worktree", "add", "--detach", worktree, "HEAD"], root);
    await overlayWorkingTree(root, worktree, specPath);
    copyEnvFiles(root, worktree);
    linkDependencies(root, worktree);
    const reportFile = join(worktree, ".prove-fails-report.json");
    const listed = await playwright(
      worktree,
      ["--list", ...(project === undefined ? [] : [`--project=${project}`]), specPath],
      reportFile,
    );
    const target = resolveTest(listed.report, specPath, title, project);
    const before = await runOnce(worktree, specPath, target, reportFile);
    if (before.failed) {
      throw problem(`the test "${target.title}" fails before the patch: ${firstLine(before.output)}`);
    }
    const applied = await run("git", ["apply", ...APPLY_FLAGS, "--ignore-whitespace", patch], worktree);
    if (applied.failed) {
      throw problem(`the patch does not apply: ${firstLine(applied.stderr)}`);
    }
    return await runOnce(worktree, specPath, target, reportFile);
  } finally {
    await removeWorktree(root, worktree);
  }
}

function usage(): Error {
  return problem("usage is node qa/prove-fails.mts <spec> <title words> <patch> [--project=<name>]");
}

function parseArguments(args: readonly string[]): { spec: string; title: string; patch: string; project?: string } {
  const project = args.map((arg) => PROJECT_FLAG.exec(arg)?.[1]).find((name) => name !== undefined);
  const words = args.filter((arg) => !PROJECT_FLAG.test(arg));
  const [spec, ...rest] = words;
  const patch = rest.pop();
  if (spec === undefined || patch === undefined || rest.length === 0) {
    throw usage();
  }
  return { spec, title: rest.join(" "), patch, ...(project === undefined ? {} : { project }) };
}

async function main(args: readonly string[]): Promise<void> {
  const { spec, title, patch, project } = parseArguments(args);
  const result = await proveFails(spec, title, patch, project);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function reportFailure(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  main(process.argv.slice(2)).catch(reportFailure);
}
