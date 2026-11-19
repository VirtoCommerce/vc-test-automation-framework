import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { readProjectFacts } from "./project-facts.mts";

const CLI_FILE_NAME = "contract.mts";
const SOURCE_KINDS = ["ticket", "doc", "area", "gap"] as const;
const ORACLE_SOURCES = ["ticket", "doc", "schema", "observed"] as const;
const REQUIRED_SECTIONS = [
  "Source",
  "Scope",
  "Out of scope",
  "Cases",
  "Stand needs",
  "Building blocks",
  "Known issues",
  "Verification",
] as const;
const CASE_COLUMNS = ["Case", "Technique", "Project", "Data role", "Oracle"] as const;
const AMENDMENTS_HEADING = /^amendment/i;
const NO_ROLE = "none";
const APPROVAL = /^Approved:\s*([^,\s][^,]*),\s*\d{4}-\d{2}-\d{2}\s*$/m;
const CONFIRMATION = /^(characterization|confirmed by \S.*)$/;

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

function checkSource(lines: string[]): string[] {
  const first = lines.find((line) => line.trim() !== "")?.trim() ?? "";
  const accepted = SOURCE_KINDS.some((kind) => new RegExp(`^${kind}:\\s*\\S`).test(first));
  return accepted ? [] : [problem("## Source must start with ticket:, doc:, area: or gap:")];
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparator(cells: string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function oracleSources(oracle: string): string[] {
  return oracle
    .split(";")
    .map((part) => ORACLE_SOURCES.find((source) => part.trim().startsWith(`${source}:`)))
    .filter((source) => source !== undefined);
}

function isObservedOnly(oracle: string): boolean {
  const sources = oracleSources(oracle);
  return sources.length > 0 && sources.every((source) => source === "observed");
}

function checkCases(lines: string[], roles: string[] | undefined): { problems: string[]; rows: CaseRow[] } {
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
    const dataRole = cell(cells, "Data role");
    for (const role of dataRole.split(",").map((item) => item.trim())) {
      if (roles !== undefined && role !== "" && role !== NO_ROLE && !roles.includes(role)) {
        problems.push(problem(`${label} data role "${role}" is not in the facts roles`));
      }
    }
    rows.push({ name, dataRole, oracle });
  }
  return { problems, rows };
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

function checkAmendments(heading: string, lines: string[]): string[] {
  const entries: { title: string; body: string[] }[] = [];
  const outside: string[] = [];
  for (const line of lines) {
    const heading = /^### (\S.*?)\s*$/.exec(line);
    if (heading?.[1] !== undefined) {
      entries.push({ title: heading[1], body: [] });
    } else {
      (entries.at(-1)?.body ?? outside).push(line);
    }
  }
  const problems: string[] = [];
  if (hasText(outside)) {
    problems.push(problem(`## ${heading} has text outside a ### entry`));
  }
  for (const entry of entries) {
    if (!APPROVAL.test(entry.body.join("\n"))) {
      problems.push(problem(`## ${heading} entry "${entry.title}" has no Approved: <who>, <date> line`));
    }
  }
  return problems;
}

/**
 * Checks the shape of a contract. Only the shape: it does not judge whether the cases are good.
 *
 * @param roles when given, every data role in the cases table must be one of them (or `none`).
 * @returns one line per problem, empty when the contract is valid.
 */
export function checkContract(markdown: string, roles?: string[]): string[] {
  const parsed = parseSections(markdown);
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
    problems.push(...checkSource(source));
  }
  const cases = sections.get("Cases");
  const checked = cases !== undefined && hasText(cases) ? checkCases(cases, roles) : { problems: [], rows: [] };
  problems.push(...checked.problems, ...checkObservedOnly(sections.get("Observed only"), checked.rows));
  for (const { heading, lines } of parsed) {
    if (AMENDMENTS_HEADING.test(heading)) {
      problems.push(...checkAmendments(heading, lines));
    }
  }
  return problems;
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const [command, file] = process.argv.slice(2);
    if (command !== "check" || file === undefined) {
      throw new Error("contract: usage is node .claude/checks/contract.mts check <file>");
    }
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      throw new Error(`contract: ${file} cannot be read`);
    }
    const problems = checkContract(text, Object.keys(readProjectFacts().roles));
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
