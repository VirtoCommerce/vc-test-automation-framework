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
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { parse } from "@babel/parser";

export type ProveFailsResult = { failed: boolean; output: string; mutated: string };

type TestRef = { project: string; title: string; line: number; expectedStatus: string };

type Outcome = { status: string; expectedStatus: string; messages: string[] };

type AstNode = Record<string, unknown> & { type: string; start: number; end: number };

type Edit = { start: number; end: number; text: string };

const CLI_FILE_NAME = "prove-fails.mts";
const TEMP_PREFIX = "prove-fails-";
const PLAYWRIGHT_CLI = ["node_modules", "@playwright", "test", "cli.js"];
const RUN_TIMEOUT_MS = 300_000;
const MAX_BUFFER = 64 * 1024 * 1024;
const MAX_OUTPUT = 3000;
const MAX_PROBLEM = 300;
const PROJECT_FLAG = /^--project=([\w.-]+)$/;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const ENV_FILE = /^\.env(\..+)?$/;
const ENV_EXAMPLE = ".env.example";
const MUTATION_SUFFIX = "__mutated__";
const MATCHER_PREFIX = "to";
const MATCHER_CHAIN = ["not", "resolves", "rejects"];
const EXPECT_VARIANTS = ["soft", "poll"];
const TEST_FUNCTIONS = ["ArrowFunctionExpression", "FunctionExpression"];
const SKIPPED_KEYS = new Set([
  "loc",
  "extra",
  "leadingComments",
  "trailingComments",
  "innerComments",
  "comments",
  "tokens",
]);
const FIXTURES_FLAG = "PROVE_FAILS_FIXTURES";
const INHERITED_PLAYWRIGHT = /^(PW_|TEST_WORKER_INDEX$|TEST_PARALLEL_INDEX$|FORCE_COLOR$)/;

function problem(text: string): Error {
  return new Error(`prove-fails: ${text}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNode(value: unknown): value is AstNode {
  return (
    isRecord(value) &&
    typeof value["type"] === "string" &&
    typeof value["start"] === "number" &&
    typeof value["end"] === "number"
  );
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
    const child = execFile(
      file,
      [...args],
      { cwd, env, timeout: RUN_TIMEOUT_MS, maxBuffer: MAX_BUFFER, encoding: "utf8", windowsHide: true },
      (error, stdout, stderr) => {
        done({ stdout, stderr, failed: error !== null });
      },
    );
    child.stdin?.end();
  });
}

async function git(args: readonly string[], cwd: string): Promise<string> {
  const result = await run("git", args, cwd);
  if (result.failed) {
    throw problem(`git ${args[0] ?? ""} failed: ${firstLine(result.stderr)}`);
  }
  return result.stdout;
}

function childrenOf(node: AstNode): AstNode[] {
  const children: AstNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (!SKIPPED_KEYS.has(key)) {
      children.push(...(Array.isArray(value) ? value : [value]).filter(isNode));
    }
  }
  return children;
}

function collect(node: AstNode, wanted: (node: AstNode) => boolean, found: AstNode[] = []): AstNode[] {
  if (wanted(node)) {
    found.push(node);
  }
  for (const child of childrenOf(node)) {
    collect(child, wanted, found);
  }
  return found;
}

function lineOf(node: unknown, which: "start" | "end" = "start"): number {
  const loc = isRecord(node) ? node["loc"] : undefined;
  const position = isRecord(loc) ? loc[which] : undefined;
  const line = isRecord(position) ? position["line"] : undefined;
  return typeof line === "number" ? line : 0;
}

function nameOf(node: unknown): string | undefined {
  return isNode(node) && node.type === "Identifier" && typeof node["name"] === "string" ? node["name"] : undefined;
}

function isMember(node: unknown): node is AstNode {
  return isNode(node) && node.type === "MemberExpression" && node["computed"] !== true;
}

function isExpectCall(node: unknown): boolean {
  if (!isNode(node) || node.type !== "CallExpression") {
    return false;
  }
  const callee = node["callee"];
  if (nameOf(callee) === "expect") {
    return true;
  }
  return (
    isMember(callee) &&
    nameOf(callee["object"]) === "expect" &&
    EXPECT_VARIANTS.includes(nameOf(callee["property"]) ?? "")
  );
}

function isMatcherCall(node: AstNode): boolean {
  if (node.type !== "CallExpression") {
    return false;
  }
  const callee = node["callee"];
  if (!isMember(callee) || !(nameOf(callee["property"]) ?? "").startsWith(MATCHER_PREFIX)) {
    return false;
  }
  let current: unknown = callee["object"];
  while (isMember(current) && MATCHER_CHAIN.includes(nameOf(current["property"]) ?? "")) {
    current = current["object"];
  }
  return isExpectCall(current);
}

function jsonString(text: string): string {
  return JSON.stringify(text).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

function plainTemplateText(argument: AstNode): string | undefined {
  const quasis = argument["quasis"];
  const first = Array.isArray(quasis) ? quasis[0] : undefined;
  const cooked = isRecord(first) && isRecord(first["value"]) ? first["value"]["cooked"] : undefined;
  const expressions = argument["expressions"];
  return Array.isArray(expressions) && expressions.length === 0 && typeof cooked === "string" ? cooked : undefined;
}

function mutationOf(argument: AstNode): string | undefined {
  const value = argument["value"];
  if (argument.type === "NumericLiteral" && typeof value === "number") {
    return Number.isFinite(value) && value + 1 !== value ? String(value + 1) : undefined;
  }
  if (argument.type === "StringLiteral" && typeof value === "string") {
    return jsonString(`${value}${MUTATION_SUFFIX}`);
  }
  const text = argument.type === "TemplateLiteral" ? plainTemplateText(argument) : undefined;
  return text === undefined ? undefined : jsonString(`${text}${MUTATION_SUFFIX}`);
}

function parseSource(source: string): AstNode {
  try {
    const file: unknown = parse(source, { sourceType: "module", plugins: ["typescript"] });
    if (isRecord(file) && isNode(file["program"])) {
      return file["program"];
    }
  } catch (error) {
    throw problem(`the spec cannot be parsed: ${firstLine(error instanceof Error ? error.message : String(error))}`);
  }
  throw problem("the spec cannot be parsed");
}

function rootName(callee: unknown): string | undefined {
  let current = callee;
  while (isMember(current)) {
    current = current["object"];
  }
  return nameOf(current);
}

function isInsideTest(program: AstNode, testLine: number, line: number): boolean {
  const calls = collect(
    program,
    (node) =>
      node.type === "CallExpression" &&
      rootName(node["callee"]) === "test" &&
      lineOf(node["callee"]) <= testLine &&
      testLine <= lineOf(node["callee"], "end"),
  );
  return calls.some((call) =>
    (Array.isArray(call["arguments"]) ? call["arguments"] : []).some(
      (argument) =>
        isNode(argument) &&
        TEST_FUNCTIONS.includes(argument.type) &&
        lineOf(argument) <= line &&
        line <= lineOf(argument, "end"),
    ),
  );
}

/**
 * Makes the mutation `proveFails` runs, and nothing else: on `line` of `source`, every string, number and plain
 * template literal that is a direct argument of an `expect(...).toXxx(...)` call (also `.not`, `.resolves`,
 * `.rejects`, `expect.soft`, `expect.poll`) is replaced, a number by its value plus one, a string by itself with
 * `__mutated__` appended. The source is parsed, so a literal in a comment, a regular expression or a template with
 * substitutions is never a candidate, and no text of the caller enters the result. With `testLine` the line must also
 * lie inside the body of the test declared there.
 *
 * @returns the mutated source and the mutated line.
 * @throws Error when the source cannot be parsed, the line holds no such literal, or it is outside the test.
 */
export function mutateAssertion(source: string, line: number, testLine?: number): { source: string; mutated: string } {
  const program = parseSource(source);
  const edits: Edit[] = [];
  for (const call of collect(program, isMatcherCall)) {
    for (const argument of (Array.isArray(call["arguments"]) ? call["arguments"] : []).filter(isNode)) {
      const text = lineOf(argument) === line ? mutationOf(argument) : undefined;
      if (text !== undefined) {
        edits.push({ start: argument.start, end: argument.end, text });
      }
    }
  }
  if (edits.length === 0) {
    throw problem(`line ${line} has no expect(...).toXxx(...) call with a string or number literal argument`);
  }
  if (testLine !== undefined && !isInsideTest(program, testLine, line)) {
    throw problem(`line ${line} is not inside the test that starts on line ${testLine}`);
  }
  let mutated = source;
  for (const edit of edits.sort((first, second) => second.start - first.start)) {
    mutated = `${mutated.slice(0, edit.start)}${edit.text}${mutated.slice(edit.end)}`;
  }
  return { source: mutated, mutated: mutated.split(/\r\n|[\n\r\u2028\u2029]/)[line - 1] ?? "" };
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

function checkedLine(line: number): void {
  if (!Number.isInteger(line) || line < 1) {
    throw problem("the line must be a positive whole number");
  }
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

/**
 * The environment of a nested Playwright run: the caller's, without what a Playwright worker sets for its own
 * children (`PW_*`, worker indexes, a `NODE_OPTIONS` that names Playwright), plus the report file and
 * the flag that lifts the generated-fixtures ignore.
 */
export function childEnv(base: NodeJS.ProcessEnv, reportFile: string): NodeJS.ProcessEnv {
  const kept = Object.fromEntries(
    Object.entries(base).filter(
      ([key, value]) => !INHERITED_PLAYWRIGHT.test(key) && !(key === "NODE_OPTIONS" && /playwright/i.test(value ?? "")),
    ),
  );
  return { ...kept, [FIXTURES_FLAG]: "1", PLAYWRIGHT_JSON_OUTPUT_FILE: reportFile };
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
    childEnv(process.env, reportFile),
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
      refs.push({
        project: textOf(entry["projectName"]),
        title: textOf(specEntry["title"]),
        line: specEntry["line"],
        expectedStatus: textOf(entry["expectedStatus"]),
      });
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

function refuseExpectedFailure(title: string, expectedStatus: string): void {
  if (expectedStatus !== "" && expectedStatus !== "passed") {
    const expected = expectedStatus === "failed" ? "fail" : expectedStatus;
    throw problem(`the test "${title}" is expected to ${expected}, so a failure after the change proves nothing`);
  }
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
    found.push({
      status: textOf(entry["status"]),
      expectedStatus: textOf(entry["expectedStatus"]),
      messages: messages.filter((message) => message.trim() !== ""),
    });
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
  refuseExpectedFailure(target.title, outcome.expectedStatus);
  if (outcome.status === "expected") {
    return { failed: false, output: "the test passed" };
  }
  if (outcome.status === "unexpected") {
    return { failed: true, output: outcome.messages.join("\n---\n").slice(0, MAX_OUTPUT) };
  }
  const detail = firstLine(errorMessages(report).join(" "));
  throw problem(`the test "${target.title}" is ${outcome.status}, not a clean pass or failure: ${detail}`);
}

/**
 * Proves that one test fails when a value it checks is changed. The script makes the change itself
 * ({@link mutateAssertion}): nothing the caller writes reaches the copy. It works on a throw-away git worktree in the
 * system temporary directory, outside the repository (the working tree is never touched): the worktree gets the
 * repository's `HEAD`, the working tree's uncommitted changes and the spec as it is on disk, a link to `node_modules`
 * and the `.env*` files. The test is run once as it is, with no retries, and must pass; then the literal on `line`
 * is changed and the same test run again.
 *
 * `failed` is true only when the test passed before the change and failed after it. A flaky or skipped result, and a
 * test that is expected to fail, are errors, not proofs. The worktree is removed on every path, and the removal never
 * hides the result or the error.
 *
 * @param spec repository-relative path of the spec file.
 * @param title the test's own title, or a part of it that matches exactly one test in the file.
 * @param line the line of the assertion (`expect(...).toXxx(...)`) inside that test whose literal is changed.
 * @param project the Playwright project to run; resolved from the spec when omitted and the test is in one project.
 * @throws Error when an input is wrong, the line holds no changeable literal, the test fails before the change, is
 * flaky, expected to fail, or does not run.
 */
export async function proveFails(
  spec: string,
  title: string,
  line: number,
  project?: string,
): Promise<ProveFailsResult> {
  checkedLine(line);
  const root = resolve((await git(["rev-parse", "--show-toplevel"], process.cwd())).trim());
  const specPath = checkedSpec(spec, root);
  const source = readFileSync(join(root, specPath), "utf8");
  mutateAssertion(source, line);
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
    refuseExpectedFailure(target.title, target.expectedStatus);
    const change = mutateAssertion(source, line, target.line);
    const before = await runOnce(worktree, specPath, target, reportFile);
    if (before.failed) {
      throw problem(`the test "${target.title}" fails before the change: ${firstLine(before.output)}`);
    }
    writeFileSync(join(worktree, specPath), change.source);
    const after = await runOnce(worktree, specPath, target, reportFile);
    return { ...after, mutated: change.mutated };
  } finally {
    await removeWorktree(root, worktree);
  }
}

function usage(): Error {
  return problem("usage is node qa/prove-fails.mts <spec> <line> <title words> [--project=<name>]");
}

function parseArguments(args: readonly string[]): { spec: string; line: number; title: string; project?: string } {
  const project = args.map((arg) => PROJECT_FLAG.exec(arg)?.[1]).find((name) => name !== undefined);
  const [spec, lineText, ...words] = args.filter((arg) => !PROJECT_FLAG.test(arg));
  if (spec === undefined || lineText === undefined || !/^\d+$/.test(lineText) || words.length === 0) {
    throw usage();
  }
  return { spec, line: Number(lineText), title: words.join(" "), ...(project === undefined ? {} : { project }) };
}

async function main(args: readonly string[]): Promise<void> {
  const { spec, line, title, project } = parseArguments(args);
  const result = await proveFails(spec, title, line, project);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function reportFailure(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  main(process.argv.slice(2)).catch(reportFailure);
}
