import { readFileSync } from "node:fs";
import { basename } from "node:path";

export type Route = "command" | "cli" | "api" | "mcp" | "paste";

export const ROLE_PURPOSES = ["admin", "customer", "otherCustomer"] as const;

export type RolePurpose = (typeof ROLE_PURPOSES)[number];

export type ProjectFacts = {
  tracker: { kind: string; keyPattern: string; acceptanceCriteriaField?: string; routes: Route[] };
  docSources: { name: string; route: Route; where: string }[];
  commands: { typecheck: string; lint: string; test: Record<string, string> };
  critical: string[];
  knowledgeDir: string;
  roles: Record<string, string>;
  roleFor: Record<RolePurpose, string>;
  rolePermissions?: Record<string, string[]>;
  coverageWeights: { risk: number; callFrequency: number; runFrequency: number; stability: number; cost: number };
  flakyRunSeries: number;
  quality: {
    maxSteps: number;
    maxLines: number;
    maxExpects: number;
    maxNesting: number;
    maxConditionals: number;
    stableSeries: number;
    durationBudgetMs: Record<string, number>;
    slowdownRatio: number;
    slowdownMinMs: number;
  };
  autonomy: Record<string, "apply" | "propose">;
  healerPaths: string[];
};

export const DEFAULT_CLIENT_ROUTES: readonly Route[] = ["paste"];

const MIN_FLAKY_RUN_SERIES = 2;
const MIN_STABLE_SERIES = 2;
const MIN_SLOWDOWN_RATIO = 1;
export const PROJECT_FACTS_PATH = ".qa/project.json";
const DEFAULT_AUTONOMY_KEY = "*";
const CLI_FILE_NAME = "project-facts.mts";
const HEALER_PATH = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)*\/?$/;
const FORBIDDEN_HEALER_SEGMENTS = ["qa", "node_modules", ".claude"];

export const SHORT_NAME_SEGMENT = /~\d/;

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

function asRoleName(value: unknown, path: string, roles: Record<string, string>): string {
  const name = asString(value, path);
  if (!Object.hasOwn(roles, name)) {
    fail(path, "is not a key of roles");
  }
  return name;
}

function isRolePurpose(key: string): key is RolePurpose {
  return ROLE_PURPOSES.some((purpose) => purpose === key);
}

function parseRoleFor(value: unknown, roles: Record<string, string>): ProjectFacts["roleFor"] {
  const roleFor = asRecord(value, "roleFor");
  const stray = Object.keys(roleFor).find((key) => !isRolePurpose(key));
  if (stray !== undefined) {
    fail(`roleFor["${stray}"]`, `is not a purpose (${ROLE_PURPOSES.join(", ")})`);
  }
  const role = (purpose: RolePurpose): string =>
    asRoleName(present(roleFor, purpose, `roleFor.${purpose}`), `roleFor.${purpose}`, roles);
  const parsed = { admin: role("admin"), customer: role("customer"), otherCustomer: role("otherCustomer") };
  if (parsed.customer === parsed.otherCustomer) {
    fail("roleFor.otherCustomer", `is the same role as roleFor.customer ("${parsed.customer}")`);
  }
  if (sameAccount(roles[parsed.customer], roles[parsed.otherCustomer])) {
    fail("roleFor.otherCustomer", `is the same account as roleFor.customer (roles["${parsed.customer}"])`);
  }
  return parsed;
}

/** Accounts are compared without regard to case, as a sign-in name is. */
function sameAccount(first: string | undefined, second: string | undefined): boolean {
  return first !== undefined && second !== undefined && first.toLowerCase() === second.toLowerCase();
}

function parsePermissionList(value: unknown, path: string): string[] {
  const permissions = asStringList(value, path);
  const repeated = permissions.find((permission, index) => permissions.indexOf(permission) !== index);
  if (repeated !== undefined) {
    fail(path, `lists "${repeated}" twice`);
  }
  return permissions;
}

function sameSet(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((item) => second.includes(item));
}

function parseRolePermissions(value: unknown, roles: Record<string, string>): Record<string, string[]> {
  const parsed = Object.fromEntries(
    Object.entries(asRecord(value, "rolePermissions")).map(([role, permissions]) => {
      const path = `rolePermissions["${role}"]`;
      if (!Object.hasOwn(roles, role)) {
        return fail(path, "is not a key of roles");
      }
      return [role, parsePermissionList(permissions, path)];
    }),
  );
  const listed = Object.keys(parsed);
  for (const [index, role] of listed.entries()) {
    const other = listed
      .slice(index + 1)
      .find((name) => sameAccount(roles[role], roles[name]) && !sameSet(parsed[role] ?? [], parsed[name] ?? []));
    if (other !== undefined) {
      fail(`rolePermissions["${other}"]`, `differs from rolePermissions["${role}"], though both roles are one account`);
    }
  }
  return parsed;
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

function asCount(value: unknown, path: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    fail(path, `must be an integer of at least ${minimum}`);
  }
  return value;
}

function parseDurationBudgets(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(asRecord(value, "quality.durationBudgetMs")).map(([project, budget]) => {
      if (typeof budget !== "number" || !Number.isFinite(budget) || budget <= 0) {
        return fail(`quality.durationBudgetMs["${project}"]`, "must be a number above 0");
      }
      return [project, budget];
    }),
  );
}

function parseQuality(value: unknown): ProjectFacts["quality"] {
  const quality = asRecord(value, "quality");
  const count = (key: string, minimum: number): number =>
    asCount(present(quality, key, `quality.${key}`), `quality.${key}`, minimum);
  const ratio = present(quality, "slowdownRatio", "quality.slowdownRatio");
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < MIN_SLOWDOWN_RATIO) {
    fail("quality.slowdownRatio", `must be a number of at least ${MIN_SLOWDOWN_RATIO}`);
  }
  return {
    maxSteps: count("maxSteps", 0),
    maxLines: count("maxLines", 1),
    maxExpects: count("maxExpects", 0),
    maxNesting: count("maxNesting", 0),
    maxConditionals: count("maxConditionals", 0),
    stableSeries: count("stableSeries", MIN_STABLE_SERIES),
    durationBudgetMs: parseDurationBudgets(present(quality, "durationBudgetMs", "quality.durationBudgetMs")),
    slowdownRatio: ratio,
    slowdownMinMs: count("slowdownMinMs", 0),
  };
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

function isForbiddenHealerSegment(segment: string): boolean {
  const name = segment.toLowerCase();
  return (
    name === "." ||
    name === ".." ||
    name.startsWith("-") ||
    name.startsWith(".git") ||
    name.startsWith(".qa") ||
    FORBIDDEN_HEALER_SEGMENTS.includes(name) ||
    SHORT_NAME_SEGMENT.test(name)
  );
}

function parseHealerPaths(value: unknown): string[] {
  return asList(value, "healerPaths").map((item, index) => {
    const path = `healerPaths[${index}]`;
    const text = asString(item, path);
    if (!HEALER_PATH.test(text) || text.split("/").filter(Boolean).some(isForbiddenHealerSegment)) {
      fail(path, "must be a plain directory inside the repository, not its root, git, qa, tooling or a short name");
    }
    return text;
  });
}

/**
 * Validates the parsed contents of a project facts file.
 *
 * @throws Error `"project.json: <path> <problem>"` naming the first missing or invalid field.
 */
export function parseProjectFacts(json: unknown): ProjectFacts {
  const root = asRecord(json, "file");
  const roles = asStringMap(present(root, "roles", "roles"), "roles");
  const roleFor = parseRoleFor(present(root, "roleFor", "roleFor"), roles);
  const permissions = root["rolePermissions"];
  return {
    tracker: parseTracker(present(root, "tracker", "tracker")),
    docSources: parseDocSources(present(root, "docSources", "docSources")),
    commands: parseCommands(present(root, "commands", "commands")),
    critical: asStringList(present(root, "critical", "critical"), "critical"),
    knowledgeDir: asString(present(root, "knowledgeDir", "knowledgeDir"), "knowledgeDir"),
    roles,
    roleFor,
    ...(permissions === undefined ? {} : { rolePermissions: parseRolePermissions(permissions, roles) }),
    coverageWeights: parseCoverageWeights(present(root, "coverageWeights", "coverageWeights")),
    flakyRunSeries: parseFlakyRunSeries(present(root, "flakyRunSeries", "flakyRunSeries")),
    quality: parseQuality(present(root, "quality", "quality")),
    autonomy: parseAutonomy(present(root, "autonomy", "autonomy")),
    healerPaths: parseHealerPaths(present(root, "healerPaths", "healerPaths")),
  };
}

/**
 * Reads and validates the project facts of the repository the agents work in. There is no fallback: a
 * missing or broken file stops the agents instead of letting them guess.
 *
 * @throws Error `"project.json: <path> cannot be read"` or the first validation error.
 */
export function readProjectFacts(path = PROJECT_FACTS_PATH): ProjectFacts {
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
