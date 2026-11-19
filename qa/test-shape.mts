import type { ProjectFacts } from "./project-facts.mts";

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { parse } from "@babel/parser";

import { readProjectFacts } from "./project-facts.mts";

export type QualityFinding = { test: string; finding: string };

type Limits = ProjectFacts["quality"];

type AstNode = Record<string, unknown> & { type: string; start: number; end: number };

type Shape = { steps: number; expects: number; conditionals: number; nesting: number };

const CLI_FILE_NAME = "test-shape.mts";
const TEST_NAME = "test";
const TEST_VARIANTS = ["only", "skip", "fixme", "fail"];
const STEP_NAME = "step";
const EXPECT_NAME = "expect";
const EXPECT_VARIANTS = ["soft", "poll"];
const TEST_FUNCTIONS = ["ArrowFunctionExpression", "FunctionExpression"];
const CALLS = ["CallExpression", "OptionalCallExpression"];
const MEMBERS = ["MemberExpression", "OptionalMemberExpression"];
const CONDITIONALS = [
  "IfStatement",
  "ConditionalExpression",
  "SwitchStatement",
  "WhileStatement",
  "DoWhileStatement",
  "ForStatement",
];
const MIN_TEST_ARGUMENTS = 2;
const MAX_TITLE = 80;
const SKIPPED_KEYS = new Set(["loc", "extra", "leadingComments", "trailingComments", "innerComments", "comments"]);

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

function childrenOf(node: AstNode): AstNode[] {
  const children: AstNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (!SKIPPED_KEYS.has(key)) {
      children.push(...(Array.isArray(value) ? value : [value]).filter(isNode));
    }
  }
  return children;
}

function lineOf(node: AstNode, which: "start" | "end"): number {
  const loc = node["loc"];
  const position = isRecord(loc) ? loc[which] : undefined;
  const line = isRecord(position) ? position["line"] : undefined;
  return typeof line === "number" ? line : 0;
}

function nameOf(node: unknown): string | undefined {
  return isNode(node) && node.type === "Identifier" && typeof node["name"] === "string" ? node["name"] : undefined;
}

function isMember(node: unknown): node is AstNode {
  return isNode(node) && MEMBERS.includes(node.type) && node["computed"] !== true;
}

function isCall(node: AstNode): boolean {
  return CALLS.includes(node.type);
}

function argumentsOf(call: AstNode): unknown[] {
  const args = call["arguments"];
  return Array.isArray(args) ? args : [];
}

function isMemberOf(callee: unknown, object: string, properties: readonly string[]): boolean {
  return (
    isMember(callee) && nameOf(callee["object"]) === object && properties.includes(nameOf(callee["property"]) ?? "")
  );
}

function isTestCall(call: AstNode): boolean {
  const callee = call["callee"];
  const args = argumentsOf(call);
  const last = args.at(-1);
  return (
    isCall(call) &&
    (nameOf(callee) === TEST_NAME || isMemberOf(callee, TEST_NAME, TEST_VARIANTS)) &&
    args.length >= MIN_TEST_ARGUMENTS &&
    isNode(last) &&
    TEST_FUNCTIONS.includes(last.type)
  );
}

function isStepCall(node: AstNode): boolean {
  return isCall(node) && isMemberOf(node["callee"], TEST_NAME, [STEP_NAME]);
}

function isExpectCall(node: AstNode): boolean {
  const callee = node["callee"];
  return isCall(node) && (nameOf(callee) === EXPECT_NAME || isMemberOf(callee, EXPECT_NAME, EXPECT_VARIANTS));
}

function measure(body: AstNode): Shape {
  const shape: Shape = { steps: 0, expects: 0, conditionals: 0, nesting: 0 };
  const visit = (node: AstNode, depth: number): void => {
    const here = node.type === "BlockStatement" && node !== body ? depth + 1 : depth;
    shape.nesting = Math.max(shape.nesting, here);
    shape.steps += isStepCall(node) ? 1 : 0;
    shape.expects += isExpectCall(node) ? 1 : 0;
    shape.conditionals += CONDITIONALS.includes(node.type) ? 1 : 0;
    for (const child of childrenOf(node)) {
      visit(child, here);
    }
  };
  visit(body, 0);
  return shape;
}

function titleOf(call: AstNode, source: string): string {
  const [title] = argumentsOf(call);
  if (isNode(title) && title.type === "StringLiteral" && typeof title["value"] === "string") {
    return title["value"].slice(0, MAX_TITLE);
  }
  return isNode(title) ? source.slice(title.start, title.end).replace(/\s+/g, " ").slice(0, MAX_TITLE) : "";
}

function collectTests(node: AstNode, found: AstNode[] = []): AstNode[] {
  if (isTestCall(node)) {
    found.push(node);
    return found;
  }
  for (const child of childrenOf(node)) {
    collectTests(child, found);
  }
  return found;
}

function parseSource(source: string, file: string): AstNode {
  try {
    const parsed: unknown = parse(source, { sourceType: "module", plugins: ["typescript"] });
    if (isRecord(parsed) && isNode(parsed["program"])) {
      return parsed["program"];
    }
  } catch (error) {
    const reason = error instanceof Error ? (error.message.split("\n")[0] ?? "") : "";
    throw new Error(`test-shape: ${file} cannot be parsed: ${reason}`);
  }
  throw new Error(`test-shape: ${file} cannot be parsed`);
}

function overLimit(count: number, limit: number, what: string, setting: string): string[] {
  return count > limit ? [`${count} ${what}, more than the ${limit} that ${setting} allows`] : [];
}

/**
 * Measures every `test(...)` (also `test.only`, `test.skip`, `test.fixme`, `test.fail` with a title and a function) in
 * a spec's source against the project's `quality` limits, one finding per limit broken. The measure is static: a
 * test counts once however often a table-driven loop runs it, and a `for ... of` or `for ... in` loop is not a
 * conditional. Steps are `test.step` calls, expects are `expect`, `expect.soft` and `expect.poll` calls, nesting is
 * the depth of blocks inside the test function (its own body not counted), conditionals are `if`, `?:`, `switch`,
 * `while`, `do ... while` and `for (;;)`.
 *
 * @throws Error when the source cannot be parsed.
 */
export function checkTestShape(source: string, file: string, limits: Limits): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const call of collectTests(parseSource(source, file))) {
    const fn = argumentsOf(call).at(-1);
    if (!isNode(fn) || !isNode(fn["body"])) {
      continue;
    }
    const test = `${file}:${lineOf(call, "start")} ${titleOf(call, source)}`;
    const shape = measure(fn["body"]);
    const lines = lineOf(call, "end") - lineOf(call, "start") + 1;
    const reasons = [
      ...overLimit(shape.steps, limits.maxSteps, "test.step calls", "quality.maxSteps"),
      ...overLimit(lines, limits.maxLines, "lines", "quality.maxLines"),
      ...overLimit(shape.expects, limits.maxExpects, "expect calls", "quality.maxExpects"),
      ...overLimit(shape.nesting, limits.maxNesting, "levels of nesting", "quality.maxNesting"),
      ...overLimit(shape.conditionals, limits.maxConditionals, "conditionals", "quality.maxConditionals"),
    ];
    findings.push(...reasons.map((finding) => ({ test, finding })));
  }
  return findings;
}

function readSpec(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    throw new Error(`test-shape: ${file} cannot be read`);
  }
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const files = process.argv.slice(2);
    if (files.length === 0) {
      throw new Error("test-shape: usage is node qa/test-shape.mts <spec>…");
    }
    const { quality } = readProjectFacts();
    const findings = files.flatMap((file) => checkTestShape(readSpec(file), file, quality));
    process.stdout.write(
      findings.length === 0 ? "ok\n" : `${findings.map((f) => `${f.test}: ${f.finding}`).join("\n")}\n`,
    );
    if (findings.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
