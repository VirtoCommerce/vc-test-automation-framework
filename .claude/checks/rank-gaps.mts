import type { ProjectFacts } from "./project-facts.mts";

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { PROJECT_FACTS_PATH, readProjectFacts } from "./project-facts.mts";

export type Weights = ProjectFacts["coverageWeights"];

export type Gap = {
  area: string;
  surface: "graphql" | "rest" | "frontend";
  name: string;
  critical: boolean;
  enabledOnStand: boolean;
  uiWithoutApi: boolean;
  factors?: Partial<Record<keyof Weights, number>>;
};

export type RankedGap = Gap & { score: number };

const CLI_FILE_NAME = "rank-gaps.mts";
const STDIN = 0;
const SCORE_PRECISION = 1e9;
const CRITICAL_RISK = 1;
const UI_WITHOUT_API_RISK = 0.5;
const SURFACES: readonly string[] = ["graphql", "rest", "frontend"];
const WEIGHT_KEYS: readonly (keyof Weights)[] = ["risk", "callFrequency", "runFrequency", "stability", "cost"];
const INPUT_DIR = /^\.qa\/[\w./-]+$/;
const FENCED_JSON = /```json\s*\n([\s\S]*?)\n```/;

function factorOf(gap: Gap, key: keyof Weights): number {
  const value = gap.factors?.[key] ?? 0;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`rank-gaps: factor ${key} of "${gap.name}" must be a number from 0 to 1`);
  }
  return value;
}

function scoreOf(gap: Gap, weights: Weights): number {
  const risk =
    factorOf(gap, "risk") + (gap.critical ? CRITICAL_RISK : 0) + (gap.uiWithoutApi ? UI_WITHOUT_API_RISK : 0);
  const score =
    weights.risk * risk +
    weights.callFrequency * factorOf(gap, "callFrequency") +
    weights.runFrequency * factorOf(gap, "runFrequency") +
    weights.stability * factorOf(gap, "stability") -
    weights.cost * factorOf(gap, "cost");
  return Math.round(score * SCORE_PRECISION) / SCORE_PRECISION;
}

function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function compareRanked(left: RankedGap, right: RankedGap): number {
  if (left.enabledOnStand !== right.enabledOnStand) {
    return left.enabledOnStand ? -1 : 1;
  }
  if (left.critical !== right.critical) {
    return left.critical ? -1 : 1;
  }
  return (
    right.score - left.score ||
    compareText(left.name, right.name) ||
    compareText(left.area, right.area) ||
    compareText(left.surface, right.surface)
  );
}

/**
 * Ranks the coverage gaps, highest priority first. A gap's score is the weighted sum of its factors, each from 0 to
 * 1: `risk` (raised by 1 when the gap is a critical flow and by 0.5 when a UI test has no API test under it),
 * `callFrequency`, `runFrequency` and `stability` add to it, and `cost` (automation cost) takes from it, so a cheap gap
 * comes first; scores are rounded to nine decimals so equal scores tie. The order is strict: gaps enabled on the stand
 * before gaps that are not (a module or flag that is off), then critical flows before the others, then by score, highest
 * first, then by name, then area, then surface. A critical gap therefore outranks a non-critical one whatever the
 * scores and weights.
 *
 * @throws Error when a factor is not a number from 0 to 1.
 */
export function rankGaps(gaps: readonly Gap[], weights: Weights): RankedGap[] {
  return gaps.map((gap) => ({ ...gap, score: scoreOf(gap, weights) })).sort(compareRanked);
}

/** Marks a gap critical when its name or its area is one of the project's critical flows (case-insensitive). */
export function markCritical(gaps: readonly Gap[], critical: readonly string[]): Gap[] {
  const flows = new Set(critical.map((flow) => flow.trim().toLowerCase()));
  return gaps.map((gap) => ({
    ...gap,
    critical: gap.critical || flows.has(gap.name.toLowerCase()) || flows.has(gap.area.toLowerCase()),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGap(value: unknown, index: number): Gap {
  const path = `gaps[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`rank-gaps: ${path} is not an object`);
  }
  const { area, surface, name, critical, enabledOnStand, uiWithoutApi, factors } = value;
  if (typeof area !== "string" || typeof name !== "string" || name === "") {
    throw new Error(`rank-gaps: ${path} needs a text area and name`);
  }
  if (typeof surface !== "string" || !SURFACES.includes(surface)) {
    throw new Error(`rank-gaps: ${path}.surface must be graphql, rest or frontend`);
  }
  if (typeof critical !== "boolean" || typeof enabledOnStand !== "boolean" || typeof uiWithoutApi !== "boolean") {
    throw new Error(`rank-gaps: ${path} needs true or false for critical, enabledOnStand and uiWithoutApi`);
  }
  const base = { area, name, critical, enabledOnStand, uiWithoutApi };
  const gapSurface = surface === "graphql" || surface === "rest" ? surface : "frontend";
  if (factors === undefined) {
    return { ...base, surface: gapSurface };
  }
  if (!isRecord(factors)) {
    throw new Error(`rank-gaps: ${path}.factors is not an object`);
  }
  const parsed: Partial<Record<keyof Weights, number>> = {};
  for (const key of WEIGHT_KEYS) {
    const factor = factors[key];
    if (factor === undefined) {
      continue;
    }
    if (typeof factor !== "number") {
      throw new Error(`rank-gaps: ${path}.factors.${key} is not a number`);
    }
    parsed[key] = factor;
  }
  return { ...base, surface: gapSurface, factors: parsed };
}

/** Reads the gap list from a JSON array, a `{ "gaps": [...] }` object, or the first ```json block of a Markdown file. */
export function parseGaps(text: string): Gap[] {
  let json: unknown;
  try {
    json = JSON.parse(FENCED_JSON.exec(text)?.[1] ?? text);
  } catch {
    throw new Error("rank-gaps: the input is not valid JSON");
  }
  const list = isRecord(json) ? json["gaps"] : json;
  if (!Array.isArray(list)) {
    throw new Error("rank-gaps: the input is not a list of gaps");
  }
  return list.map(parseGap);
}

function readInput(file: string | undefined): string {
  if (file === undefined) {
    return readFileSync(STDIN, "utf8");
  }
  if (!INPUT_DIR.test(file) || file.split("/").includes("..")) {
    throw new Error("rank-gaps: the input file must be a path under .qa/");
  }
  try {
    return readFileSync(file, "utf8");
  } catch {
    throw new Error("rank-gaps: the input file cannot be read");
  }
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const facts = readProjectFacts(PROJECT_FACTS_PATH);
    const gaps = markCritical(parseGaps(readInput(process.argv[2])), facts.critical);
    process.stdout.write(`${JSON.stringify(rankGaps(gaps, facts.coverageWeights), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
