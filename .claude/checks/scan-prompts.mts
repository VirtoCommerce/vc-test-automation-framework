import type { ProjectFacts } from "./project-facts.mts";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { readProjectFacts } from "./project-facts.mts";

export type PromptFinding = { file: string; line: number; finding: string };

export const PROMPT_DIRS = [".claude/agents", ".claude/skills", ".claude/commands", ".claude/hooks"] as const;
export const SETTINGS_PATH = ".claude/settings.json";
export const MODULES_DIR = ".claude/checks";
export const OURS_ONLY_PATH = ".claude/checks/ours-only.json";
export const CLIENT_TERMS_PATH = ".qa/client-terms.local.txt";
export const MAX_AGENT_CHARS = 8000;
export const EXAMPLE_HEADING = "Example from this repository";
export const HIDES_FILE = "example section hides the file";
export const ALLOWED_HOSTS = ["localhost", "127.0.0.1", "::1", "example.com", "api.github.com"] as const;

const CLI_FILE_NAME = "scan-prompts.mts";
const SKILLS_DIR = ".claude/skills";
const AGENTS_DIR = ".claude/agents/";
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE_OPEN = /^\s*(`{3,}|~{3,})/;
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;
const URL_HOST = /\b[a-z][a-z0-9+.-]*:\/\/(?:[^/@\s]*@)?(\[[0-9a-f:.]+\]|[^\s/:?#)"'`>\]<\\]+)/gi;
const BARE_HOST = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?![a-z0-9-]|\.[a-z0-9-]|\()/gi;
const TOP_LEVEL_DOMAINS = [
  "com",
  "net",
  "org",
  "io",
  "dev",
  "app",
  "cloud",
  "biz",
  "info",
  "co",
  "us",
  "eu",
  "br",
  "pl",
  "nl",
  "de",
  "uk",
];
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const MARKDOWN_EXTENSION = /\.md$/i;
const EXTENSION = /\.[^./]+$/;
const TRAILING_PUNCTUATION = /[.,;:)]+$/;
const BRACKETS = /^\[|\]$/g;
const MIN_EXAMPLE_LEVEL = 2;
const MAX_EXAMPLE_LEVEL = 3;
const MAX_EXAMPLE_SHARE = 0.5;
const NUL = "\0";
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

type Word = { term: string; pattern: RegExp };
type Rules = { accounts: string[]; domains: string[]; terms: string[]; words: Word[] };
type Heading = { index: number; level: number; text: string };
type ExampleSection = { start: number; end: number; level: number };

function isAllowedHost(host: string): boolean {
  const name = host.toLowerCase().replace(BRACKETS, "");
  return ALLOWED_HOSTS.some((allowed) => name === allowed) || name.endsWith(".example.com");
}

function isPlaceholder(host: string): boolean {
  return host.startsWith("$") || host.includes("{");
}

function hostFindings(text: string): string[] {
  const found: string[] = [];
  const consider = (raw: string): void => {
    const host = raw.replace(TRAILING_PUNCTUATION, "");
    if (host !== "" && !isPlaceholder(host) && !isAllowedHost(host)) {
      found.push(`host "${host.toLowerCase()}"`);
    }
  };
  for (const match of text.matchAll(URL_HOST)) {
    consider(match[1] ?? "");
  }
  for (const match of text.matchAll(BARE_HOST)) {
    if (TOP_LEVEL_DOMAINS.includes((match[0].split(".").pop() ?? "").toLowerCase())) {
      consider(match[0]);
    }
  }
  for (const match of text.matchAll(IPV4)) {
    consider(match[0]);
  }
  return found;
}

function listFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function readOursOnly(root: string): string[] {
  const path = join(root, OURS_ONLY_PATH);
  if (!existsSync(path)) {
    return [];
  }
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${OURS_ONLY_PATH} is not a list of names`);
  }
  return parsed.filter((item): item is string => typeof item === "string");
}

function normaliseTerms(terms: string[]): string[] {
  return terms.map((term) => term.trim().toLowerCase()).filter((term) => term !== "" && !term.startsWith("#"));
}

function readClientTerms(root: string): string[] {
  const path = join(root, CLIENT_TERMS_PATH);
  return existsSync(path) ? normaliseTerms(readFileSync(path, "utf8").split(/\r?\n/)) : [];
}

function isOursOnly(path: string, oursOnly: string[]): boolean {
  return oursOnly.some((name) => {
    if (path.startsWith(`${SKILLS_DIR}/${name}/`)) {
      return true;
    }
    return PROMPT_DIRS.filter((dir) => dir !== SKILLS_DIR).some(
      (dir) => path.startsWith(`${dir}/`) && path.slice(dir.length + 1).replace(EXTENSION, "") === name,
    );
  });
}

function domainsOf(accounts: string[]): string[] {
  return accounts.flatMap((account) => {
    const at = account.lastIndexOf("@");
    return at < 0 ? [] : [account.slice(at + 1)];
  });
}

function wordsOf(facts: ProjectFacts): Word[] {
  const names = [
    ...Object.keys(facts.roles),
    ...Object.values(facts.roleFor),
    ...Object.values(facts.rolePermissions ?? {}).flat(),
  ];
  return [...new Set(normaliseTerms(names))].map((term) => ({
    term,
    pattern: new RegExp(`(?<![\\p{L}\\p{N}_])${term.replace(REGEX_SPECIALS, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu"),
  }));
}

function scanLine(text: string, rules: Rules): string[] {
  const lower = text.toLowerCase();
  const found = [
    ...rules.accounts.filter((account) => lower.includes(account)).map((account) => `role account "${account}"`),
    ...rules.domains.filter((domain) => lower.includes(domain)).map((domain) => `role domain "${domain}"`),
    ...rules.terms.filter((term) => lower.includes(term)).map((term) => `client term "${term}"`),
    ...rules.words.filter(({ pattern }) => pattern.test(text)).map(({ term }) => `project term "${term}"`),
    ...hostFindings(text),
  ];
  return [...new Set(found)];
}

function headingsOf(lines: string[]): Heading[] {
  const headings: Heading[] = [];
  let fence = "";
  lines.forEach((text, index) => {
    if (fence !== "") {
      const closing = FENCE_CLOSE.exec(text)?.[1] ?? "";
      if (closing.startsWith(fence.charAt(0)) && closing.length >= fence.length) {
        fence = "";
      }
      return;
    }
    const opening = FENCE_OPEN.exec(text)?.[1];
    if (opening !== undefined) {
      fence = opening;
      return;
    }
    const heading = HEADING.exec(text);
    if (heading !== null) {
      headings.push({ index, level: (heading[1] ?? "").length, text: heading[2] ?? "" });
    }
  });
  return headings;
}

function exampleSections(lines: string[], headings: Heading[]): ExampleSection[] {
  const sections: ExampleSection[] = [];
  let coveredUntil = -1;
  headings.forEach((heading, position) => {
    if (heading.text !== EXAMPLE_HEADING || heading.index <= coveredUntil) {
      return;
    }
    const next = headings.slice(position + 1).find((other) => other.level <= heading.level);
    const end = next === undefined ? lines.length : next.index;
    coveredUntil = end - 1;
    sections.push({ start: heading.index, end, level: heading.level });
  });
  return sections;
}

function isMisplaced(section: ExampleSection, firstHeadingIndex: number): boolean {
  return section.level < MIN_EXAMPLE_LEVEL || section.level > MAX_EXAMPLE_LEVEL || section.start === firstHeadingIndex;
}

function nonEmptyLines(lines: string[], from: number, to: number): number {
  return lines.slice(from, to).filter((line) => line.trim() !== "").length;
}

function hiddenSections(lines: string[], sections: ExampleSection[], firstHeading: number): ExampleSection[] {
  const placed = sections.filter((section) => !isMisplaced(section, firstHeading));
  const covered = placed.reduce((sum, section) => sum + nonEmptyLines(lines, section.start, section.end), 0);
  const tooMuch = covered > nonEmptyLines(lines, 0, lines.length) * MAX_EXAMPLE_SHARE;
  return sections.filter((section) => isMisplaced(section, firstHeading) || tooMuch);
}

function scanFile(file: string, content: string, rules: Rules): PromptFinding[] {
  const findings: PromptFinding[] = [];
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const headings = headingsOf(lines);
  const ignored = new Set<number>();
  const sections = exampleSections(lines, headings);
  const refused = new Set(hiddenSections(lines, sections, headings[0]?.index ?? -1));
  for (const section of sections) {
    if (refused.has(section)) {
      findings.push({ file, line: section.start + 1, finding: HIDES_FILE });
      continue;
    }
    for (let index = section.start; index < section.end; index += 1) {
      ignored.add(index);
    }
  }
  lines.forEach((text, index) => {
    if (!ignored.has(index)) {
      for (const finding of scanLine(text, rules)) {
        findings.push({ file, line: index + 1, finding });
      }
    }
  });
  const length = lines.join("\n").length;
  if (file.startsWith(AGENTS_DIR) && MARKDOWN_EXTENSION.test(file) && length > MAX_AGENT_CHARS) {
    findings.push({ file, line: 1, finding: `agent file has ${length} characters, at most ${MAX_AGENT_CHARS}` });
  }
  return findings;
}

function shippedFiles(root: string): string[] {
  const moduleDir = join(root, MODULES_DIR);
  const modules = listFiles(moduleDir).filter(
    (path) => relative(moduleDir, path).split(/[\\/]/).length === 1 && path.endsWith(".mts"),
  );
  const settings = existsSync(join(root, SETTINGS_PATH)) ? [join(root, SETTINGS_PATH)] : [];
  return [...PROMPT_DIRS.flatMap((dir) => listFiles(join(root, dir))), ...settings, ...modules];
}

/**
 * Scans the shipped agents, skills, commands, hooks, settings and `.claude/checks/*.mts` modules for client facts: role
 * accounts and their email domains, any host (URL with any scheme, bare hostname or IPv4 address) outside
 * {@link ALLOWED_HOSTS}, terms from `.qa/client-terms.local.txt` and `extraTerms`, the facts' role names (`roles` keys,
 * `roleFor` values) and `rolePermissions` permission names as whole words in any letter case, and agent files over
 * {@link MAX_AGENT_CHARS} characters. Names in `.claude/checks/ours-only.json` are skipped by exact path; a section under
 * a level 2 or 3 heading "Example from this repository" is skipped unless it is the file's first heading or
 * holds more than half of its non-empty lines, which is itself a finding.
 */
export function scanPrompts(root: string, facts: ProjectFacts, extraTerms: string[] = []): PromptFinding[] {
  const oursOnly = readOursOnly(root);
  const accounts = Object.values(facts.roles).map((account) => account.toLowerCase());
  const rules: Rules = {
    accounts,
    domains: domainsOf(accounts),
    terms: [...readClientTerms(root), ...normaliseTerms(extraTerms)],
    words: wordsOf(facts),
  };
  return shippedFiles(root)
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .filter((path) => !isOursOnly(path, oursOnly))
    .sort()
    .flatMap((path) => {
      const content = readFileSync(join(root, path), "utf8");
      return content.includes(NUL) ? [] : scanFile(path, content, rules);
    });
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const findings = scanPrompts(process.cwd(), readProjectFacts());
    for (const { file, line, finding } of findings) {
      process.stdout.write(`${file}:${line} ${finding}\n`);
    }
    process.exitCode = findings.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
