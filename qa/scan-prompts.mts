import type { ProjectFacts } from "./project-facts.mts";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { readProjectFacts } from "./project-facts.mts";

export type PromptFinding = { file: string; line: number; finding: string };

export const PROMPT_DIRS = [".claude/agents", ".claude/skills", ".claude/commands"] as const;
export const OURS_ONLY_PATH = "qa/ours-only.json";
export const CLIENT_TERMS_PATH = "qa/client-terms.local.txt";
export const MAX_AGENT_CHARS = 8000;
export const EXAMPLE_HEADING = "Example from this repository";
export const ALLOWED_HOSTS = ["localhost", "127.0.0.1", "example.com", "api.github.com"] as const;

const CLI_FILE_NAME = "scan-prompts.mts";
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;
const HOST = /https?:\/\/([^\s/:?#)"'`>\]<]+)/gi;
const MARKDOWN_EXTENSION = /\.md$/;
const AGENTS_DIR = ".claude/agents/";

function isAllowedHost(host: string): boolean {
  const name = host.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => name === allowed) || name.endsWith(".example.com");
}

function listMarkdown(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listMarkdown(path);
    }
    return MARKDOWN_EXTENSION.test(entry.name) ? [path] : [];
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

function readClientTerms(root: string): string[] {
  const path = join(root, CLIENT_TERMS_PATH);
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term !== "");
}

function isOursOnly(relativePath: string, oursOnly: string[]): boolean {
  return relativePath.split("/").some((segment) => oursOnly.includes(segment.replace(MARKDOWN_EXTENSION, "")));
}

function scanLine(text: string, accounts: string[], terms: string[]): string[] {
  const lower = text.toLowerCase();
  const findings: string[] = [];
  for (const account of accounts) {
    if (lower.includes(account)) {
      findings.push(`role account "${account}"`);
    }
  }
  for (const term of terms) {
    if (lower.includes(term)) {
      findings.push(`client term "${term}"`);
    }
  }
  for (const match of text.matchAll(HOST)) {
    const host = match[1] ?? "";
    if (!isAllowedHost(host)) {
      findings.push(`host "${host}"`);
    }
  }
  return findings;
}

function scanFile(file: string, content: string, accounts: string[], terms: string[]): PromptFinding[] {
  const findings: PromptFinding[] = [];
  let inFence = false;
  let exampleLevel = 0;
  content.split(/\r?\n/).forEach((text, index) => {
    if (FENCE.test(text)) {
      inFence = !inFence;
    }
    const heading = inFence ? null : HEADING.exec(text);
    if (heading !== null) {
      const level = (heading[1] ?? "").length;
      if (exampleLevel > 0 && level <= exampleLevel) {
        exampleLevel = 0;
      }
      if (exampleLevel === 0 && heading[2] === EXAMPLE_HEADING) {
        exampleLevel = level;
        return;
      }
    }
    if (exampleLevel > 0) {
      return;
    }
    for (const finding of scanLine(text, accounts, terms)) {
      findings.push({ file, line: index + 1, finding });
    }
  });
  if (file.startsWith(AGENTS_DIR) && content.length > MAX_AGENT_CHARS) {
    findings.push({
      file,
      line: 1,
      finding: `agent file has ${content.length} characters, at most ${MAX_AGENT_CHARS}`,
    });
  }
  return findings;
}

/**
 * Scans the shipped prompts (agents, skills, commands) for client facts: role accounts of the facts, any
 * `https?://` host outside the allowlist, terms from `qa/client-terms.local.txt` and `extraTerms`, and
 * agent files over {@link MAX_AGENT_CHARS} characters. Files named in `qa/ours-only.json` and sections under a
 * heading "Example from this repository" are skipped.
 */
export function scanPrompts(root: string, facts: ProjectFacts, extraTerms: string[] = []): PromptFinding[] {
  const oursOnly = readOursOnly(root);
  const accounts = Object.values(facts.roles).map((account) => account.toLowerCase());
  const terms = [...readClientTerms(root), ...extraTerms.map((term) => term.toLowerCase())];
  return PROMPT_DIRS.flatMap((dir) => listMarkdown(join(root, dir)))
    .map((path) => relative(root, path).replaceAll("\\", "/"))
    .filter((path) => !isOursOnly(path, oursOnly))
    .sort()
    .flatMap((path) => scanFile(path, readFileSync(join(root, path), "utf8"), accounts, terms));
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
