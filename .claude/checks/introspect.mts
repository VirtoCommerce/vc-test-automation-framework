import type { GraphQLObjectType, IntrospectionQuery } from "graphql";

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { runVariables } from "./browser-secrets.mts";
import { importSuiteDependency, readProjectFactsIn } from "./project-facts.mts";
import { standOrigins } from "./stand.mts";
import { anonymousRequest, verifiesSsl } from "./stand-request.mts";

const CLI_FILE_NAME = "introspect.mts";
const GRAPHQL_PATH = "/graphql";
const REST_PATH = "/docs/PlatformUI/swagger.json";
const GRAPHQL_FILE = "schema-graphql.graphql";
const REST_FILE = "schema-rest.txt";
const KINDS = ["graphql", "rest"] as const;
const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "head", "options"];
const INTROSPECTION_QUERY =
  "query IntrospectionQuery { __schema { queryType { name } mutationType { name } subscriptionType { name } types { ...FullType } directives { name description locations args { ...InputValue } } } } fragment FullType on __Type { kind name description fields(includeDeprecated: true) { name description args { ...InputValue } type { ...TypeRef } isDeprecated deprecationReason } inputFields { ...InputValue } interfaces { ...TypeRef } enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason } possibleTypes { ...TypeRef } } fragment InputValue on __InputValue { name description type { ...TypeRef } defaultValue } fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }";

type Kind = (typeof KINDS)[number];

function problem(text: string): Error {
  return new Error(`introspect: ${text}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string, route: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw problem(`${route} did not answer JSON`);
  }
}

function fieldCount(type: GraphQLObjectType | null | undefined): number {
  return Object.keys(type?.getFields() ?? {}).length;
}

/**
 * The GraphQL schema as text (SDL) from an introspection answer, with a summary of its size.
 *
 * @throws Error when the answer holds no schema, or the `graphql` package (a peer dependency of the framework) is
 * missing.
 */
export async function schemaText(answer: unknown): Promise<{ text: string; summary: string }> {
  const data = isRecord(answer) ? answer["data"] : undefined;
  if (!isRecord(data) || !isRecord(data["__schema"])) {
    throw problem(`${GRAPHQL_PATH} answered no schema (introspection may be switched off or need a sign-in)`);
  }
  let graphql: typeof import("graphql");
  try {
    graphql = await importSuiteDependency<typeof import("graphql")>("graphql");
  } catch {
    throw problem("the graphql package is not installed: install it, or generate the schema with the suite's codegen");
  }
  const schema = graphql.buildClientSchema(data as unknown as IntrospectionQuery);
  const types = Object.keys(schema.getTypeMap()).filter((name) => !name.startsWith("__")).length;
  return {
    text: graphql.printSchema(schema),
    summary: `${types} types, ${fieldCount(schema.getQueryType())} queries, ${fieldCount(schema.getMutationType())} mutations`,
  };
}

function parametersOf(operation: Record<string, unknown>): string {
  const parameters = Array.isArray(operation["parameters"]) ? operation["parameters"] : [];
  return parameters
    .filter(isRecord)
    .map((parameter) => {
      const required = parameter["required"] === true ? ",required" : "";
      return `${String(parameter["name"])}(${String(parameter["in"])}${required})`;
    })
    .join(" ");
}

/**
 * One line per operation of an OpenAPI document, `<METHOD> <path> | <operationId> | <summary> | <parameters> |
 * <response codes>`, the form the agents search with `Grep`.
 *
 * @throws Error when the document holds no paths.
 */
export function operationLines(document: unknown): string[] {
  const paths = isRecord(document) ? document["paths"] : undefined;
  if (!isRecord(paths)) {
    throw problem(`${REST_PATH} holds no paths`);
  }
  const lines: string[] = [];
  for (const [path, item] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(isRecord(item) ? item : {})) {
      if (HTTP_METHODS.includes(method) && isRecord(operation)) {
        const responses = isRecord(operation["responses"]) ? Object.keys(operation["responses"]).join(",") : "";
        const summary = String(operation["summary"] ?? "")
          .replace(/\s+/g, " ")
          .trim();
        const id = String(operation["operationId"] ?? "");
        lines.push(`${method.toUpperCase()} ${path} | ${id} | ${summary} | ${parametersOf(operation)} | ${responses}`);
      }
    }
  }
  return lines;
}

async function fetchSchema(
  kind: Kind,
  origin: string,
  verifySsl: boolean,
): Promise<{ file: string; text: string; summary: string }> {
  const graphql = kind === "graphql";
  const route = graphql ? GRAPHQL_PATH : REST_PATH;
  const answer = await anonymousRequest(origin, route, {
    method: graphql ? "POST" : "GET",
    ...(graphql ? { body: JSON.stringify({ query: INTROSPECTION_QUERY }) } : {}),
    verifySsl,
  });
  if (answer.status !== 200) {
    throw problem(
      `${route} answered ${answer.status} to an anonymous request: take the schema from the suite's own codegen, or report not reached: needs a sign-in`,
    );
  }
  const body = parseJson(answer.text, route);
  if (graphql) {
    const { text, summary } = await schemaText(body);
    return { file: GRAPHQL_FILE, text, summary };
  }
  const lines = operationLines(body);
  return { file: REST_FILE, text: lines.join("\n"), summary: `${lines.length} operations` };
}

async function main(args: readonly string[]): Promise<void> {
  const [kind, extra] = args;
  const known = KINDS.find((name) => name === kind);
  if (extra !== undefined || known === undefined) {
    throw problem(`usage is node .claude/checks/${CLI_FILE_NAME} ${KINDS.join("|")}`);
  }
  const projectDir = process.cwd();
  const vars = runVariables(projectDir);
  const { knowledgeDir } = readProjectFactsIn(projectDir);
  const { file, text, summary } = await fetchSchema(known, standOrigins(vars).backend, verifiesSsl(vars));
  const target = resolve(projectDir, knowledgeDir, file);
  const inside = relative(projectDir, target);
  if (inside.startsWith("..") || isAbsolute(inside)) {
    throw problem("knowledgeDir of the project facts is outside the repository");
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `# captured ${new Date().toISOString().slice(0, 10)} from the stand's backend\n${text}\n`);
  process.stdout.write(`introspect: wrote ${join(knowledgeDir, file).replaceAll("\\", "/")} (${summary})\n`);
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
