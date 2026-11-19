import type { ProjectFacts, Route } from "./project-facts.mts";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { readProjectFacts } from "./project-facts.mts";

export type TicketCard = {
  key: string;
  title: string;
  type: string;
  status: string;
  description: string;
  acceptanceCriteria: string[] | "none found";
  links: { key: string; relation: string }[];
  url: string;
  route: Route;
  capturedAt: string;
};

export const NO_ACCEPTANCE_CRITERIA = "none found";

const CLI_FILE_NAME = "ticket-card.mts";
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function fail(path: string, problem: string): never {
  throw new Error(`ticket card: ${path} ${problem}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(path, "is not an object");
  }
  return value;
}

function present(source: Record<string, unknown>, key: string, path: string): unknown {
  const value = source[key];
  if (value === undefined) {
    fail(path, "is missing");
  }
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value === "") {
    fail(path, "is not a non-empty string");
  }
  return value;
}

function asText(value: unknown, path: string): string {
  if (typeof value !== "string") {
    fail(path, "is not a string");
  }
  return value;
}

function checkSafeKey(key: string): void {
  if (!SAFE_FILE_NAME.test(key) || key.includes("..")) {
    fail("key", "is not a safe file name");
  }
}

function parseKey(value: unknown, facts: ProjectFacts): string {
  const key = asString(value, "key");
  if (!new RegExp(facts.tracker.keyPattern).test(key)) {
    fail("key", "does not match tracker.keyPattern");
  }
  checkSafeKey(key);
  return key;
}

function parseAcceptanceCriteria(value: unknown): TicketCard["acceptanceCriteria"] {
  if (value === NO_ACCEPTANCE_CRITERIA) {
    return NO_ACCEPTANCE_CRITERIA;
  }
  if (!Array.isArray(value)) {
    return fail("acceptanceCriteria", `is not a list or "${NO_ACCEPTANCE_CRITERIA}"`);
  }
  if (value.length === 0) {
    return fail("acceptanceCriteria", `is empty, use "${NO_ACCEPTANCE_CRITERIA}"`);
  }
  return value.map((item, index) => asString(item, `acceptanceCriteria[${index}]`));
}

function parseLinks(value: unknown): TicketCard["links"] {
  if (!Array.isArray(value)) {
    return fail("links", "is not a list");
  }
  return value.map((item, index) => {
    const path = `links[${index}]`;
    const link = asRecord(item, path);
    return {
      key: asString(present(link, "key", `${path}.key`), `${path}.key`),
      relation: asString(present(link, "relation", `${path}.relation`), `${path}.relation`),
    };
  });
}

function parseRoute(value: unknown, facts: ProjectFacts): Route {
  switch (value) {
    case "command":
    case "cli":
    case "api":
    case "mcp":
    case "paste":
      if (!facts.tracker.routes.includes(value)) {
        return fail("route", "is not allowed by tracker.routes");
      }
      return value;
    default:
      return fail("route", "is not a route");
  }
}

function parseCapturedAt(value: unknown): string {
  const text = asString(value, "capturedAt");
  if (Number.isNaN(Date.parse(text)) || !/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    fail("capturedAt", "is not an ISO date");
  }
  return text;
}

/**
 * Validates a ticket card against the project facts. A card is complete or it is rejected: there is no
 * partial card.
 *
 * @throws Error `"ticket card: <path> <problem>"` naming the first missing or invalid field.
 */
export function parseTicketCard(json: unknown, facts: ProjectFacts): TicketCard {
  const root = asRecord(json, "card");
  return {
    key: parseKey(present(root, "key", "key"), facts),
    title: asString(present(root, "title", "title"), "title"),
    type: asString(present(root, "type", "type"), "type"),
    status: asString(present(root, "status", "status"), "status"),
    description: asText(present(root, "description", "description"), "description"),
    acceptanceCriteria: parseAcceptanceCriteria(present(root, "acceptanceCriteria", "acceptanceCriteria")),
    links: parseLinks(present(root, "links", "links")),
    url: asString(present(root, "url", "url"), "url"),
    route: parseRoute(present(root, "route", "route"), facts),
    capturedAt: parseCapturedAt(present(root, "capturedAt", "capturedAt")),
  };
}

/**
 * Writes a validated card to `<dir>/tickets/<key>.json`, creating the folder. Overwrites an earlier card of
 * the same ticket.
 *
 * @returns the path written.
 * @throws Error `"ticket card: key is not a safe file name"` before anything is written.
 */
export function writeTicketCard(card: TicketCard, dir: string): string {
  checkSafeKey(card.key);
  const folder = join(dir, "tickets");
  mkdirSync(folder, { recursive: true });
  const path = join(folder, `${card.key}.json`);
  writeFileSync(path, `${JSON.stringify(card, null, 2)}\n`, "utf8");
  return path;
}

function checkFile(file: string): TicketCard {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return fail(file, "cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(file, "is not valid JSON");
  }
  return parseTicketCard(json, readProjectFacts());
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    const [command, file] = process.argv.slice(2);
    if (command !== "check" || file === undefined) {
      throw new Error("ticket card: usage is node .claude/qa/ticket-card.mts check <file>");
    }
    const card = checkFile(file);
    process.stdout.write(`ok ${card.key}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
