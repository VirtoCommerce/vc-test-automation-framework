import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import { playwrightConfigArgs, readProjectFacts } from "./project-facts.mts";
import { CREDENTIAL_SHAPE } from "./readonly-shell.mts";
import { walkRoot } from "./reconcile-run.mts";
import { contractSeries, sameSpec } from "./run-record.mts";

const CLI_FILE_NAME = "contract.mts";
const APPROVED_FLAG = "--approved";
const IMPLEMENTED_FLAG = "--implemented";
const FLAGS = [APPROVED_FLAG, IMPLEMENTED_FLAG];
const SOURCE_KINDS = ["ticket", "doc", "area", "gap"] as const;
const ORACLE_SOURCES = ["ticket", "doc", "schema", "observed"] as const;
const REQUIRED_SECTIONS = [
  "Source",
  "Scope",
  "Out of scope",
  "Existing coverage",
  "Cases",
  "Stand needs",
  "Building blocks",
  "Platform defects",
  "Verification",
] as const;
const CASE_COLUMNS = ["Case", "Technique", "Project", "Data role", "Critical flow", "Parameters", "Oracle"] as const;
const AMENDMENTS_HEADING = /^amendment/i;
const NO_ROLE = "none";
const NOT_CRITICAL = "no";
const COMMENT = /<!--[\s\S]*?-->/g;
const LOCAL_STATE = /\.qa\/(?:reports|kb)\/[^\s`'"()<>,;]*/g;
const PATH_END_PUNCTUATION = /[.:!?\]]+$/;
const FILE_NAME = /[^/]\.[A-Za-z0-9]+$/;
const GLOB = /[*?]/;
const STATED_DATE = /\((\d{4}-\d{2}-\d{2})\)/;
const AMENDMENT_FIELDS = ["Cases", "Changes"] as const;
const DROPS_LINE = /^Drops:\s*(.+)$/im;
const TITLE_SEPARATOR = " › ";
const LIST_BUFFER = 256 * 1024 * 1024;
const MAX_REASON = 300;
const APPROVAL_LINE = /^Approved:\s*([^,\s][^,]*),\s*\d{4}-\d{2}-\d{2}(?:\s+\(relayed: "[^\n]+"\))?\s*$/;
const APPROVAL = new RegExp(APPROVAL_LINE.source, "m");
const APPROVAL_SECTION = "Approval";
const CONFIRMATION = /^(characterization|confirmed by \S.*)$/;
const OBSERVED = "observed:";
const PENDING = /^pending\b/;
const AT_FIRST_RUN = /^at first run\s+\S/;
const FIRST_RUN_LINE = /\(first run\)$/;
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const RECORDED = /^(.*?)\s*\(([^()]*)\)$/;
const ESCAPED_PIPE = /\\\|/g;
const REPORTS_DIR = ".qa/";
const REPORT_PATH = /^\.qa\/reports\/explore-[a-z0-9]+(-[a-z0-9]+)*\.md$/;
const OBSERVED_VALUES = "Observed values";

type CaseRow = { name: string; dataRole: string; oracle: string };

function problem(text: string): string {
  return `contract: ${text}`;
}

type Section = { heading: string; lines: string[] };

function parseSections(markdown: string): Section[] {
  const sections: Section[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^## (\S.*?)\s*$/.exec(line);
    if (heading?.[1] !== undefined) {
      sections.push({ heading: heading[1], lines: [] });
    } else {
      sections.at(-1)?.lines.push(line);
    }
  }
  return sections;
}

function hasText(lines: string[]): boolean {
  return lines.some((line) => line.trim() !== "");
}

/**
 * The files a line names under `.qa/reports/` or `.qa/kb/`. A path ends at whitespace, a backtick, a quote or a
 * bracket, and the sentence's closing punctuation is not part of it. A directory (`.qa/reports/`), a name with no
 * extension and a pattern (`coverage-*.md`) name no file, as in "none exists under `.qa/reports/`".
 */
function localStateFiles(line: string): string[] {
  return [...line.matchAll(LOCAL_STATE)]
    .map((match) => match[0].replace(PATH_END_PUNCTUATION, ""))
    .filter((path) => FILE_NAME.test(path) && !GLOB.test(path));
}

/**
 * A line of `## Source` that names a report or a knowledge snapshot (`.qa/reports/…`, `.qa/kb/…`) must carry the date
 * the planner read it, `(<yyyy-mm-dd>)`, and the file must not have changed after that date (`modifiedOn`, when given).
 */
function checkLocalState(lines: string[], modifiedOn: ((path: string) => string | undefined) | undefined): string[] {
  const problems: string[] = [];
  for (const line of lines) {
    const date = STATED_DATE.exec(line)?.[1];
    for (const path of localStateFiles(line)) {
      const changed = date === undefined ? undefined : modifiedOn?.(path);
      if (date === undefined) {
        problems.push(
          problem(`## Source names ${path} with no date: write (<yyyy-mm-dd>) after it, the day it was read`),
        );
      } else if (changed !== undefined && changed > date) {
        problems.push(
          problem(
            `## Source: ${path} changed on ${changed}, after the ${date} the contract states: read it again and update the date`,
          ),
        );
      }
    }
  }
  return problems;
}

function checkSource(lines: string[], modifiedOn: ((path: string) => string | undefined) | undefined): string[] {
  const first = lines.find((line) => line.trim() !== "")?.trim() ?? "";
  const accepted = SOURCE_KINDS.some((kind) => new RegExp(`^${kind}:\\s*\\S`).test(first));
  return [
    ...(accepted ? [] : [problem("## Source must start with ticket:, doc:, area: or gap:")]),
    ...checkLocalState(lines, modifiedOn),
  ];
}

/** Splits the Oracle cell on `separator` outside double quotes, so a quoted observed value may hold `;`. */
function splitOutsideQuotes(text: string, separator: string): string[] {
  const parts = [""];
  let quoted = false;
  for (const character of text) {
    if (character === '"') {
      quoted = !quoted;
    }
    if (character === separator && !quoted) {
      parts.push("");
    } else {
      parts[parts.length - 1] += character;
    }
  }
  return parts;
}

/** Splits a table row on every `|` that is not escaped as `\|`, the Markdown way to write a pipe in a cell. */
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

function isSeparator(cells: string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function oracleParts(oracle: string): string[] {
  return splitOutsideQuotes(oracle, ";").map((part) => part.trim());
}

function oracleSources(oracle: string): string[] {
  return oracleParts(oracle)
    .map((part) => ORACLE_SOURCES.find((source) => part.trim().startsWith(`${source}:`)))
    .filter((source) => source !== undefined);
}

function isObservedOnly(oracle: string): boolean {
  const sources = oracleSources(oracle);
  return sources.length > 0 && sources.every((source) => source === "observed");
}

/** The text without `<!-- -->` comments, which hold the template's instructions and its commented-out sections. */
function withoutComments(markdown: string): string {
  return markdown.replace(COMMENT, "");
}

function checkCases(
  lines: string[],
  roles: string[] | undefined,
  critical: string[] | undefined,
): { problems: string[]; rows: CaseRow[] } {
  const problems: string[] = [];
  const rows: CaseRow[] = [];
  const tableLines = lines.filter((line) => line.trim().startsWith("|"));
  const header = splitRow(tableLines[0] ?? "");
  const index = new Map(CASE_COLUMNS.map((column) => [column, header.indexOf(column)]));
  for (const column of CASE_COLUMNS) {
    if (index.get(column) === -1) {
      problems.push(problem(`## Cases table has no ${column} column`));
    }
  }
  const body = tableLines
    .slice(1)
    .map(splitRow)
    .filter((cells) => !isSeparator(cells));
  if (body.length === 0) {
    problems.push(problem("## Cases table has no case rows"));
  }
  const cell = (cells: string[], column: (typeof CASE_COLUMNS)[number]): string => cells[index.get(column) ?? -1] ?? "";
  for (const [position, cells] of body.entries()) {
    if (cells.length !== header.length) {
      problems.push(problem(`## Cases row ${position + 1} has ${cells.length} cells, the header has ${header.length}`));
      continue;
    }
    const name = cell(cells, "Case");
    const label = name === "" ? `row ${position + 1}` : `case "${name}"`;
    for (const column of CASE_COLUMNS) {
      if (index.get(column) !== -1 && cell(cells, column) === "") {
        problems.push(problem(`${label} has an empty ${column} cell`));
      }
    }
    const oracle = cell(cells, "Oracle");
    if (
      index.get("Oracle") !== -1 &&
      oracle !== "" &&
      !ORACLE_SOURCES.some((source) => oracle.startsWith(`${source}:`))
    ) {
      problems.push(problem(`${label} oracle must start with ticket:, doc:, schema: or observed:`));
    }
    if ((oracle.match(/"/g) ?? []).length % 2 === 1) {
      problems.push(problem(`${label} oracle has an unbalanced double quote, which hides the parts after it`));
    }
    const dataRole = cell(cells, "Data role");
    for (const role of dataRole.split(",").map((item) => item.trim())) {
      if (roles !== undefined && role !== "" && role !== NO_ROLE && !roles.includes(role)) {
        problems.push(problem(`${label} data role "${role}" is not in the facts roles`));
      }
    }
    const flow = cell(cells, "Critical flow");
    for (const item of flow.split(",").map((value) => value.trim())) {
      if (critical !== undefined && item !== "" && item !== NOT_CRITICAL && !critical.includes(item)) {
        problems.push(
          problem(`${label} critical flow "${item}" is not in the facts critical list (or ${NOT_CRITICAL})`),
        );
      }
    }
    rows.push({ name, dataRole, oracle });
  }
  return { problems, rows };
}

/** The value as the explorer writes it in the report: raw, never quoted, with `\|` unescaped. */
function rawValue(value: string): string {
  const unquoted = value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  return unquoted.replace(ESCAPED_PIPE, "|");
}

function recordedLine(report: string, caseId: string, value: string): string | undefined {
  const recorded = parseSections(report).find((section) => section.heading === OBSERVED_VALUES)?.lines ?? [];
  return recorded.map((line) => line.trim()).find((line) => line.startsWith(`- ${caseId}: ${value} (`));
}

/** True when `text` (a test title) names `caseId` as a whole word: `C-1` is not named by `C-10`. */
export function namesCase(text: string, caseId: string): boolean {
  return new RegExp(`(^|[^\\w-])${caseId.replace(REGEX_SPECIALS, "\\$&")}([^\\w-]|$)`).test(text);
}

type OraclePart = { text: string; splitOnSemicolon: boolean };

/**
 * What an observed part is checked against: the report reader, whether the contract has its approval line, the text
 * of its approved amendment entries, and whether the implementation must be finished (`--implemented`).
 */
type ObservedContext = {
  readReport: ((path: string) => string | undefined) | undefined;
  approved: boolean;
  approvedAmendments: string;
  implemented: boolean;
};

/** The Oracle's parts; a part that starts with no source prefix is joined back to the part before it. */
function sourceParts(oracle: string): OraclePart[] {
  const parts: OraclePart[] = [];
  for (const text of oracleParts(oracle)) {
    const last = parts.at(-1);
    if (last !== undefined && !ORACLE_SOURCES.some((source) => text.startsWith(`${source}:`))) {
      last.text = `${last.text}; ${text}`;
      last.splitOnSemicolon = true;
    } else {
      parts.push({ text, splitOnSemicolon: false });
    }
  }
  return parts;
}

function checkObservedPart(
  label: string,
  caseId: string,
  part: OraclePart,
  context: ObservedContext,
): string | undefined {
  const { readReport, approved, approvedAmendments, implemented } = context;
  const rest = part.text.slice(OBSERVED.length).trim();
  if (part.splitOnSemicolon) {
    return `${label} observed: the value holds an unquoted ;: write the value in double quotes`;
  }
  if (AT_FIRST_RUN.test(rest)) {
    if (implemented) {
      return `${label} observed: at first run is unresolved: the expert has not recorded and pinned its value`;
    }
    return approved ? undefined : `${label} observed: at first run awaits the person's approval (## Approval)`;
  }
  const match = RECORDED.exec(rest);
  const value = match?.[1]?.trim();
  const path = match?.[2]?.trim();
  if (value === undefined || path === undefined || !(path.startsWith(REPORTS_DIR) || path.endsWith(".md"))) {
    return PENDING.test(rest)
      ? `${label} observed: oracle has no recorded value: observe it first, then write observed: <value> (.qa/reports/explore-<slug>-observed.md)`
      : `${label} observed: this contract predates observe-before-approval: re-plan its observed cases (observed: pending <what to observe>)`;
  }
  if (!REPORT_PATH.test(path)) {
    return `${label} observed: report path must be .qa/reports/explore-<slug>[-observed].md, not "${path}"`;
  }
  if (value === "") {
    return `${label} observed: oracle names a report but no value before it`;
  }
  if (CREDENTIAL_SHAPE.test(value)) {
    return `${label} observed: the value looks like a credential (a token, a password field or a Bearer header); never record one`;
  }
  if (readReport === undefined) {
    return undefined;
  }
  const report = readReport(path);
  if (report === undefined) {
    return `${label} observed: oracle names ${path}, which does not exist`;
  }
  const line = recordedLine(report, caseId, rawValue(value));
  if (line === undefined) {
    return `${label} observed: ${path} has no line "- ${caseId}: ${rawValue(value)} (" under ## ${OBSERVED_VALUES}`;
  }
  return FIRST_RUN_LINE.test(line) && !namesCase(approvedAmendments, caseId)
    ? `${label} observed: the first-run value of ${caseId} needs an approved amendment naming it (A-n first-run values: ${caseId} = <value> (<report>))`
    : undefined;
}

function checkObservedValues(rows: CaseRow[], context: ObservedContext): string[] {
  const problems: string[] = [];
  for (const row of rows) {
    const label = row.name === "" ? "a case" : `case "${row.name}"`;
    const caseId = row.name.split(/\s+/)[0] ?? "";
    for (const part of sourceParts(row.oracle).filter((item) => item.text.startsWith(OBSERVED))) {
      const found = checkObservedPart(label, caseId, part, context);
      if (found !== undefined) {
        problems.push(problem(found));
      }
    }
  }
  return problems;
}

function checkObservedOnly(lines: string[] | undefined, rows: CaseRow[]): string[] {
  const observed = rows.filter((row) => row.name !== "" && isObservedOnly(row.oracle));
  if (observed.length === 0) {
    return [];
  }
  if (lines === undefined) {
    return [problem("## Observed only is missing")];
  }
  const problems: string[] = [];
  for (const row of observed) {
    const entry = lines
      .map((line) => line.trim())
      .find((line) => /^[-*]\s/.test(line) && line.slice(2).startsWith(`${row.name}:`));
    if (entry === undefined) {
      problems.push(problem(`## Observed only does not list case "${row.name}"`));
    } else if (!CONFIRMATION.test(entry.slice(2 + row.name.length + 1).trim())) {
      problems.push(
        problem(`## Observed only case "${row.name}" must be marked confirmed by <who> or characterization`),
      );
    }
  }
  return problems;
}

function checkApproval(lines: string[]): string[] {
  const written = lines.map((line) => line.trim()).filter((line) => line !== "");
  return written.length === 1 && APPROVAL_LINE.test(written[0] ?? "")
    ? []
    : [
        problem(
          `## ${APPROVAL_SECTION} must hold one line: Approved: <who>, <date>, optionally ending (relayed: "<the person's words>")`,
        ),
      ];
}

type AmendmentEntry = { title: string; body: string[] };

function amendmentEntries(lines: string[]): { entries: AmendmentEntry[]; outside: string[] } {
  const entries: AmendmentEntry[] = [];
  const outside: string[] = [];
  for (const line of lines) {
    const heading = /^### (\S.*?)\s*$/.exec(line);
    if (heading?.[1] !== undefined) {
      entries.push({ title: heading[1], body: [] });
    } else {
      (entries.at(-1)?.body ?? outside).push(line);
    }
  }
  return { entries, outside };
}

/** The title and text of every amendment entry that carries its approval line, for the first-run values it names. */
function approvedAmendmentText(sections: Section[]): string {
  return sections
    .filter(({ heading }) => AMENDMENTS_HEADING.test(heading))
    .flatMap(({ lines }) => amendmentEntries(lines).entries)
    .filter((entry) => APPROVAL.test(entry.body.join("\n")))
    .map((entry) => [entry.title, ...entry.body].join("\n"))
    .join("\n");
}

/** The case ids an approved amendment drops (`Drops: C-04, C-05`): they need no test. */
function droppedCases(sections: Section[]): string[] {
  return sections
    .filter(({ heading }) => AMENDMENTS_HEADING.test(heading))
    .flatMap(({ lines }) => amendmentEntries(lines).entries)
    .filter((entry) => APPROVAL.test(entry.body.join("\n")))
    .flatMap((entry) => (DROPS_LINE.exec(entry.body.join("\n"))?.[1] ?? "").split(/[\s,]+/))
    .filter((id) => id !== "");
}

function checkAmendments(heading: string, lines: string[]): string[] {
  const { entries, outside } = amendmentEntries(lines);
  const problems: string[] = [];
  if (hasText(outside)) {
    problems.push(problem(`## ${heading} has text outside a ### entry`));
  }
  for (const entry of entries) {
    const body = entry.body.join("\n");
    if (!APPROVAL.test(body)) {
      problems.push(problem(`## ${heading} entry "${entry.title}" has no Approved: <who>, <date> line`));
    }
    for (const field of AMENDMENT_FIELDS) {
      if (!new RegExp(`^${field}:\\s*\\S`, "m").test(body)) {
        problems.push(problem(`## ${heading} entry "${entry.title}" has no ${field}: line naming what it changes`));
      }
    }
  }
  return problems;
}

/** A test the suite lists: its spec file, relative to the config's root directory, and its own title. */
export type ListedTest = { file: string; title: string };

/**
 * Every case id of the contract, but one an approved amendment drops, appears in the title of a listed test of a spec
 * file the contract's `## Verification` runs. Case ids (`C-01`) repeat from one contract to the next, so a test of
 * another contract's spec never counts.
 */
function checkTestsExist(rows: CaseRow[], tests: readonly ListedTest[], markdown: string, dropped: string[]): string[] {
  const specs = contractSeries(markdown).flatMap((series) => series.specs);
  if (specs.length === 0) {
    return [
      problem(
        "## Verification names no spec file: write the command that runs the new specs, so --implemented can find this contract's tests",
      ),
    ];
  }
  const titles = tests.filter((test) => specs.some((spec) => sameSpec(spec, test.file))).map((test) => test.title);
  return rows
    .map((row) => row.name.split(/\s+/)[0] ?? "")
    .filter((caseId) => caseId !== "" && !dropped.includes(caseId))
    .filter((caseId) => !titles.some((title) => namesCase(title, caseId)))
    .map((caseId) =>
      problem(
        `case ${caseId} has no test: no title of the tests in the spec files of ## Verification names it (the case id comes first in the title)`,
      ),
    );
}

/** What the contract is checked against besides its own text; every part is optional and the CLI fills them from disk. */
export type ContractChecks = {
  /** Every data role in the cases table must be one of these (or `none`). */
  roles?: string[];
  /** Every critical flow in the cases table must be one of these (or `no`): the facts' `critical`. */
  critical?: string[];
  /** The text of a report an `observed:` oracle names, or `undefined` when it does not exist: the report must hold the value. */
  readReport?: (path: string) => string | undefined;
  /** The day (`yyyy-mm-dd`) a local file last changed, or `undefined` when it does not exist: for the dates in `## Source`. */
  modifiedOn?: (path: string) => string | undefined;
  /** The contract must also carry its `## Approval` line (`check --approved`). */
  requireApproval?: boolean;
  /**
   * No `observed: at first run` part may be left and, when `listedTests` is given, every case id appears in the title of
   * one of them in a spec file of `## Verification` (`check --implemented`).
   */
  requireImplemented?: boolean;
  /** The tests the suite lists (`--list`): spec file and own title, without describe titles. */
  listedTests?: ListedTest[];
};

/**
 * Checks the shape of a contract. Only the shape: it does not judge whether the cases are good. `<!-- -->` comments are
 * ignored.
 *
 * @param checks what to check besides the text, see {@link ContractChecks}; omitted, only the shape is checked.
 * @returns one line per problem, empty when the contract is valid.
 */
export function checkContract(markdown: string, checks: ContractChecks = {}): string[] {
  const { roles, critical, readReport, modifiedOn, requireApproval = false, requireImplemented = false } = checks;
  const parsed = parseSections(withoutComments(markdown));
  const sections = new Map<string, string[]>();
  const problems: string[] = [];
  for (const { heading, lines } of parsed) {
    if (sections.has(heading)) {
      if (!problems.includes(problem(`## ${heading} appears more than once`))) {
        problems.push(problem(`## ${heading} appears more than once`));
      }
    } else {
      sections.set(heading, lines);
    }
  }
  for (const heading of REQUIRED_SECTIONS) {
    const lines = sections.get(heading);
    if (lines === undefined) {
      problems.push(problem(`## ${heading} is missing`));
    } else if (!hasText(lines)) {
      problems.push(problem(`## ${heading} is empty`));
    }
  }
  const source = sections.get("Source");
  if (source !== undefined && hasText(source)) {
    problems.push(...checkSource(source, modifiedOn));
  }
  const cases = sections.get("Cases");
  const checked =
    cases !== undefined && hasText(cases) ? checkCases(cases, roles, critical) : { problems: [], rows: [] };
  problems.push(
    ...checked.problems,
    ...checkObservedValues(checked.rows, {
      readReport,
      approved: sections.has(APPROVAL_SECTION),
      approvedAmendments: approvedAmendmentText(parsed),
      implemented: requireImplemented,
    }),
    ...checkObservedOnly(sections.get("Observed only"), checked.rows),
    ...(requireImplemented && checks.listedTests !== undefined
      ? checkTestsExist(checked.rows, checks.listedTests, markdown, droppedCases(parsed))
      : []),
  );
  const approval = sections.get(APPROVAL_SECTION);
  if (approval !== undefined) {
    problems.push(...checkApproval(approval));
  } else if (requireApproval) {
    problems.push(problem(`## ${APPROVAL_SECTION} is missing: a person has not approved this contract`));
  }
  for (const { heading, lines } of parsed) {
    if (AMENDMENTS_HEADING.test(heading)) {
      problems.push(...checkAmendments(heading, lines));
    }
  }
  return problems;
}

/** What another check reads from a contract besides its shape. */
export type ContractReferences = {
  /** The id of every row of `## Cases`, the first word of its Case cell. */
  caseIds: string[];
  /** The case ids an approved amendment drops (`Drops:`). */
  dropped: string[];
  /** The `.qa/reports/explore-<slug>[-observed].md` reports its `observed:` oracles name. */
  observedReports: string[];
  /** The files under `.qa/reports/` and `.qa/kb/` its `## Source` names. */
  sourceFiles: string[];
  /** Whether it has an `## Approval` section. */
  approved: boolean;
};

/**
 * Reads the case ids, the dropped cases, the reports and the approval of a contract, without checking its shape.
 * `<!-- -->` comments are ignored.
 *
 * @returns what the contract names; a missing section gives an empty list.
 */
function sectionLines(parsed: Section[], heading: string): string[] {
  return parsed.find((section) => section.heading === heading)?.lines ?? [];
}

export function contractReferences(markdown: string): ContractReferences {
  const parsed = parseSections(withoutComments(markdown));
  const cases = sectionLines(parsed, "Cases");
  const rows = hasText(cases) ? checkCases(cases, undefined, undefined).rows : [];
  const observedReports = rows
    .flatMap((row) => sourceParts(row.oracle))
    .filter((part) => part.text.startsWith(OBSERVED))
    .map((part) => RECORDED.exec(part.text.slice(OBSERVED.length).trim())?.[2]?.trim() ?? "")
    .filter((path) => REPORT_PATH.test(path));
  return {
    caseIds: rows.map((row) => row.name.split(/\s+/)[0] ?? "").filter((caseId) => caseId !== ""),
    dropped: droppedCases(parsed),
    observedReports: [...new Set(observedReports)],
    sourceFiles: [...new Set(sectionLines(parsed, "Source").flatMap(localStateFiles))],
    approved: parsed.some((section) => section.heading === APPROVAL_SECTION),
  };
}

function readReportFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function modifiedOnDay(path: string): string | undefined {
  try {
    const time = statSync(path).mtime;
    return `${time.getFullYear()}-${twoDigits(time.getMonth() + 1)}-${twoDigits(time.getDate())}`;
  } catch {
    return undefined;
  }
}

/**
 * Every test the suite lists (`playwright test --list --reporter=json` with the suite's config): its spec file and its
 * own title, without describe titles.
 *
 * @throws Error when the list cannot be made or is not Playwright JSON.
 */
function listedTests(suiteDir: string): ListedTest[] {
  const cli = join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");
  const { PLAYWRIGHT_JSON_OUTPUT_FILE: _output, ...environment } = process.env;
  const listed = spawnSync(
    process.execPath,
    [cli, "test", ...playwrightConfigArgs(suiteDir), "--list", "--reporter=json"],
    { cwd: process.cwd(), env: environment, encoding: "utf8", maxBuffer: LIST_BUFFER, windowsHide: true },
  );
  if (listed.status !== 0) {
    const reason = ((listed.stderr || listed.stdout).trim().split("\n")[0] ?? "").trim().slice(0, MAX_REASON);
    throw new Error(`contract: --implemented could not list the tests: ${reason}`);
  }
  const tests: ListedTest[] = [];
  try {
    walkRoot(JSON.parse(listed.stdout), "list", (test) => {
      const parts = test.split(TITLE_SEPARATOR);
      tests.push({ file: parts[0] ?? "", title: parts.at(-1) ?? "" });
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`contract: --implemented could not read the list of tests: ${reason}`);
  }
  return tests;
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const [command, ...rest] = process.argv.slice(2);
    const flags = rest.filter((argument) => argument.startsWith("--"));
    const [file, extra] = rest.filter((argument) => !argument.startsWith("--"));
    if (
      command !== "check" ||
      file === undefined ||
      extra !== undefined ||
      flags.some((flag) => !FLAGS.includes(flag)) ||
      new Set(flags).size !== flags.length
    ) {
      throw new Error(
        `contract: usage is node .claude/checks/contract.mts check [${APPROVED_FLAG}] [${IMPLEMENTED_FLAG}] <file>, run from the repository root (report paths resolve from it)`,
      );
    }
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      throw new Error(`contract: ${file} cannot be read`);
    }
    const facts = readProjectFacts();
    const implemented = flags.includes(IMPLEMENTED_FLAG);
    const problems = checkContract(text, {
      roles: Object.keys(facts.roles),
      critical: facts.critical,
      readReport: readReportFile,
      modifiedOn: modifiedOnDay,
      requireApproval: flags.includes(APPROVED_FLAG),
      requireImplemented: implemented,
      ...(implemented ? { listedTests: listedTests(facts.suiteDir) } : {}),
    });
    if (problems.length > 0) {
      process.stderr.write(`${problems.join("\n")}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`ok ${file}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
