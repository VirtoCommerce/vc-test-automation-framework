import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const ROLES = ["planner", "expert", "explorer", "healer", "reviewer", "coverage"] as const;

export const CODE_CHECKS = [
  "typecheck",
  "lint",
  "reconcile",
  "contract",
  "planted-defects",
  "expectation-guard",
  "rank-gaps",
  "verdict",
] as const;

export type Role = (typeof ROLES)[number];

export type CodeCheck = (typeof CODE_CHECKS)[number];

export type EvalCase = {
  id: string;
  role: Role;
  trap: boolean;
  prompt: string;
  startRef: string;
  codeChecks: CodeCheck[];
  plantedDefects?: string[];
  judgeCriteria: string[];
  patch?: string;
  output?: string;
  contract?: string;
  needsStand?: boolean;
};

export type LoadedCase = { evalCase: EvalCase; dir: string };

export type EvalResult = {
  caseId: string;
  codeChecks: Record<string, boolean>;
  judge: Record<string, boolean>;
  evidence: string;
};

const CASE_FILE = "case.json";
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const RELATIVE_PATH = /^[\w.@{}-]+(\/[\w.@{}-]+)*\/?$/;

function problem(source: string, text: string): Error {
  return new Error(`evals: ${source}: ${text}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is Role {
  return ROLES.some((role) => role === value);
}

function isCodeCheck(value: unknown): value is CodeCheck {
  return CODE_CHECKS.some((check) => check === value);
}

function text(source: Record<string, unknown>, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw problem(where, `${key} is not a non-empty string`);
  }
  return value;
}

function textList(source: Record<string, unknown>, key: string, where: string): string[] {
  const value = source[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw problem(where, `${key} is not a list of non-empty strings`);
  }
  return value.map(String);
}

function relativePath(source: Record<string, unknown>, key: string, where: string): string | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !RELATIVE_PATH.test(value) || value.split("/").includes("..")) {
    throw problem(where, `${key} is not a relative path inside the repository`);
  }
  return value;
}

/**
 * Reads one case. A planted defect is a marker the reviewer's text must contain, case-insensitive; `|` separates
 * alternatives, any of which counts.
 *
 * @throws Error naming the file and the first field that is wrong.
 */
export function parseCase(json: unknown, source: string): EvalCase {
  if (!isRecord(json)) {
    throw problem(source, "not a JSON object");
  }
  const id = text(json, "id", source);
  if (!ID_PATTERN.test(id)) {
    throw problem(source, "id is not lower case letters, digits and hyphens");
  }
  const role = json["role"];
  if (!isRole(role)) {
    throw problem(source, `role is not one of ${ROLES.join(", ")}`);
  }
  if (typeof json["trap"] !== "boolean") {
    throw problem(source, "trap is not true or false");
  }
  const codeChecks = textList(json, "codeChecks", source).map((name) => {
    if (!isCodeCheck(name)) {
      throw problem(source, `codeChecks names "${name}", which is not one of ${CODE_CHECKS.join(", ")}`);
    }
    return name;
  });
  const plantedDefects = json["plantedDefects"] === undefined ? undefined : textList(json, "plantedDefects", source);
  if (codeChecks.includes("planted-defects") && (plantedDefects === undefined || plantedDefects.length === 0)) {
    throw problem(source, "planted-defects needs a non-empty plantedDefects");
  }
  const needsStand = json["needsStand"];
  if (needsStand !== undefined && typeof needsStand !== "boolean") {
    throw problem(source, "needsStand is not true or false");
  }
  const patch = relativePath(json, "patch", source);
  const output = relativePath(json, "output", source);
  const contract = relativePath(json, "contract", source);
  return {
    id,
    role,
    trap: json["trap"],
    prompt: text(json, "prompt", source),
    startRef: text(json, "startRef", source),
    codeChecks,
    judgeCriteria: textList(json, "judgeCriteria", source),
    ...(plantedDefects === undefined ? {} : { plantedDefects }),
    ...(patch === undefined ? {} : { patch }),
    ...(output === undefined ? {} : { output }),
    ...(contract === undefined ? {} : { contract }),
    ...(needsStand === undefined ? {} : { needsStand }),
  };
}

function segmentMatcher(segment: string): RegExp {
  const escaped = segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function expand(base: string, segments: readonly string[]): string[] {
  const [segment, ...rest] = segments;
  if (segment === undefined) {
    return [base];
  }
  if (!segment.includes("*")) {
    const next = join(base, segment);
    return existsSync(next) ? expand(next, rest) : [];
  }
  const matcher = segmentMatcher(segment);
  return readdirSync(base)
    .filter((name) => matcher.test(name))
    .sort()
    .flatMap((name) => expand(join(base, name), rest));
}

function caseFolders(path: string): string[] {
  if (statSync(path).isFile()) {
    return path.endsWith(CASE_FILE) ? [path.slice(0, -CASE_FILE.length - 1)] : [];
  }
  if (existsSync(join(path, CASE_FILE))) {
    return [path];
  }
  return readdirSync(path)
    .sort()
    .map((name) => join(path, name))
    .filter((child) => statSync(child).isDirectory() && existsSync(join(child, CASE_FILE)));
}

/**
 * Loads every case a path pattern selects. `*` matches within one path segment; a match is a case folder (one holding
 * `case.json`), the file itself, or a folder whose sub-folders are case folders. The result is in path order.
 *
 * @throws Error when a case file is not valid JSON or fails {@link parseCase}, or when no case matches.
 */
export function loadCases(pattern: string, root: string): LoadedCase[] {
  const segments = pattern.replace(/\\/g, "/").split("/").filter(Boolean);
  const folders = expand(root, segments).flatMap(caseFolders);
  if (folders.length === 0) {
    throw new Error(`evals: no case matches ${pattern}`);
  }
  return folders.map((dir) => {
    const file = join(dir, CASE_FILE);
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      throw problem(file, "cannot be read as JSON");
    }
    return { evalCase: parseCase(json, file), dir };
  });
}
