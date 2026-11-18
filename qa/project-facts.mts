import { readFileSync } from "node:fs";
import { basename } from "node:path";

export type Route = "command" | "cli" | "api" | "mcp" | "paste";

export type ProjectFacts = {
  tracker: { kind: string; keyPattern: string; acceptanceCriteriaField?: string; routes: Route[] };
  docSources: { name: string; route: Route; where: string }[];
  commands: { typecheck: string; lint: string; test: Record<string, string> };
  critical: string[];
  knowledgeDir: string;
  roles: Record<string, string>;
  coverageWeights: { risk: number; callFrequency: number; runFrequency: number; stability: number; cost: number };
  flakyRunSeries: number;
  autonomy: Record<string, "apply" | "propose">;
};

export const DEFAULT_CLIENT_ROUTES: readonly Route[] = ["paste"];

const MIN_FLAKY_RUN_SERIES = 2;
const DEFAULT_PATH = ".qa/project.json";
const DEFAULT_AUTONOMY_KEY = "*";
const CLI_FILE_NAME = "project-facts.mts";

function fail(path: string, problem: string): never {
  throw new Error(`project.json: ${path} ${problem}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function present(source: Record<string, unknown>, key: string, path: string): unknown {
  const value = source[key];
  if (value === undefined) {
    fail(path, "is missing");
  }
  return value;
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(path, "is not an object");
  }
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value === "") {
    fail(path, "is not a non-empty string");
  }
  return value;
}

function asList(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(path, "is not a list");
  }
  return value;
}

function asStringList(value: unknown, path: string): string[] {
  return asList(value, path).map((item, index) => asString(item, `${path}[${index}]`));
}

function asStringMap(value: unknown, path: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(asRecord(value, path)).map(([key, item]) => [key, asString(item, `${path}["${key}"]`)]),
  );
}

function asRoute(value: unknown, path: string): Route {
  switch (value) {
    case "command":
    case "cli":
    case "api":
    case "mcp":
    case "paste":
      return value;
    default:
      return fail(path, "is not a route");
  }
}

function asWeight(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(path, "must be a number of at least 0");
  }
  return value;
}

function parseTracker(value: unknown): ProjectFacts["tracker"] {
  const tracker = asRecord(value, "tracker");
  const keyPattern = asString(present(tracker, "keyPattern", "tracker.keyPattern"), "tracker.keyPattern");
  try {
    new RegExp(keyPattern);
  } catch {
    fail("tracker.keyPattern", "is not a valid regular expression");
  }
  const routes =
    tracker["routes"] === undefined
      ? [...DEFAULT_CLIENT_ROUTES]
      : asList(tracker["routes"], "tracker.routes").map((item, index) => asRoute(item, `tracker.routes[${index}]`));
  if (routes.length === 0) {
    fail("tracker.routes", "is empty");
  }
  const kind = asString(present(tracker, "kind", "tracker.kind"), "tracker.kind");
  const field = tracker["acceptanceCriteriaField"];
  return field === undefined
    ? { kind, keyPattern, routes }
    : { kind, keyPattern, acceptanceCriteriaField: asString(field, "tracker.acceptanceCriteriaField"), routes };
}

function parseDocSources(value: unknown): ProjectFacts["docSources"] {
  return asList(value, "docSources").map((item, index) => {
    const path = `docSources[${index}]`;
    const source = asRecord(item, path);
    return {
      name: asString(present(source, "name", `${path}.name`), `${path}.name`),
      route: asRoute(present(source, "route", `${path}.route`), `${path}.route`),
      where: asString(present(source, "where", `${path}.where`), `${path}.where`),
    };
  });
}

function parseCommands(value: unknown): ProjectFacts["commands"] {
  const commands = asRecord(value, "commands");
  return {
    typecheck: asString(present(commands, "typecheck", "commands.typecheck"), "commands.typecheck"),
    lint: asString(present(commands, "lint", "commands.lint"), "commands.lint"),
    test: asStringMap(present(commands, "test", "commands.test"), "commands.test"),
  };
}

function parseCoverageWeights(value: unknown): ProjectFacts["coverageWeights"] {
  const weights = asRecord(value, "coverageWeights");
  const weight = (key: string): number =>
    asWeight(present(weights, key, `coverageWeights.${key}`), `coverageWeights.${key}`);
  return {
    risk: weight("risk"),
    callFrequency: weight("callFrequency"),
    runFrequency: weight("runFrequency"),
    stability: weight("stability"),
    cost: weight("cost"),
  };
}

function parseFlakyRunSeries(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < MIN_FLAKY_RUN_SERIES) {
    fail("flakyRunSeries", `must be an integer of at least ${MIN_FLAKY_RUN_SERIES}`);
  }
  return value;
}

function parseAutonomy(value: unknown): ProjectFacts["autonomy"] {
  const autonomy = asRecord(value, "autonomy");
  present(autonomy, DEFAULT_AUTONOMY_KEY, `autonomy["${DEFAULT_AUTONOMY_KEY}"]`);
  return Object.fromEntries(
    Object.entries(autonomy).map(([key, mode]) => {
      if (mode !== "apply" && mode !== "propose") {
        return fail(`autonomy["${key}"]`, 'must be "apply" or "propose"');
      }
      return [key, mode];
    }),
  );
}

/**
 * Validates the parsed contents of a project facts file.
 *
 * @throws Error `"project.json: <path> <problem>"` naming the first missing or invalid field.
 */
export function parseProjectFacts(json: unknown): ProjectFacts {
  const root = asRecord(json, "file");
  return {
    tracker: parseTracker(present(root, "tracker", "tracker")),
    docSources: parseDocSources(present(root, "docSources", "docSources")),
    commands: parseCommands(present(root, "commands", "commands")),
    critical: asStringList(present(root, "critical", "critical"), "critical"),
    knowledgeDir: asString(present(root, "knowledgeDir", "knowledgeDir"), "knowledgeDir"),
    roles: asStringMap(present(root, "roles", "roles"), "roles"),
    coverageWeights: parseCoverageWeights(present(root, "coverageWeights", "coverageWeights")),
    flakyRunSeries: parseFlakyRunSeries(present(root, "flakyRunSeries", "flakyRunSeries")),
    autonomy: parseAutonomy(present(root, "autonomy", "autonomy")),
  };
}

/**
 * Reads and validates the project facts of the repository the agents work in. There is no fallback: a
 * missing or broken file stops the agents instead of letting them guess.
 *
 * @throws Error `"project.json: <path> cannot be read"` or the first validation error.
 */
export function readProjectFacts(path = DEFAULT_PATH): ProjectFacts {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return fail(path, "cannot be read");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(path, "is not valid JSON");
  }
  return parseProjectFacts(json);
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  try {
    process.stdout.write(`${JSON.stringify(readProjectFacts(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
