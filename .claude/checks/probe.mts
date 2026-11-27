import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { runVariables } from "./browser-secrets.mts";
import { importSuiteDependency } from "./project-facts.mts";
import { CREDENTIAL_SHAPE, PROBE_FILE } from "./readonly-shell.mts";
import { standOrigins } from "./stand.mts";
import { anonymousRequest, verifiesSsl } from "./stand-request.mts";

const CLI_FILE_NAME = "probe.mts";
const GRAPHQL_PATH = "/graphql";
const MAX_SHOWN = 8000;

function problem(text: string): Error {
  return new Error(`probe: ${text}`);
}

/**
 * Checks that a GraphQL document is exactly one `query` operation, so the probe can never send a mutation or a
 * subscription.
 *
 * @throws Error when the document does not parse, holds no operation or more than one, or its operation is not a query.
 */
export async function checkQuery(document: string): Promise<void> {
  let graphql: typeof import("graphql");
  try {
    graphql = await importSuiteDependency<typeof import("graphql")>("graphql");
  } catch {
    throw problem("the graphql package is not installed");
  }
  let parsed: ReturnType<typeof graphql.parse>;
  try {
    parsed = graphql.parse(document);
  } catch (error) {
    throw problem(`the query does not parse: ${error instanceof Error ? (error.message.split("\n")[0] ?? "") : ""}`);
  }
  const operations = parsed.definitions.filter((definition) => definition.kind === graphql.Kind.OPERATION_DEFINITION);
  const [only] = operations;
  if (operations.length !== 1 || only?.kind !== graphql.Kind.OPERATION_DEFINITION || only.operation !== "query") {
    throw problem("a probe file holds exactly one query operation, never a mutation or a subscription");
  }
}

/**
 * The path a `.get` probe file names: one line that starts with `/`, with no space.
 *
 * @throws Error when the file holds anything else.
 */
export function getPath(text: string): string {
  const path = text.trim();
  if (!/^\/[^\s/][^\s]*$/.test(path)) {
    throw problem("a .get probe file holds one line: the path and query to GET, starting with /");
  }
  return path;
}

async function main(args: readonly string[]): Promise<void> {
  const [file, extra] = args;
  if (file === undefined || extra !== undefined || !PROBE_FILE.test(file)) {
    throw problem(`usage is node .claude/checks/${CLI_FILE_NAME} .qa/probes/<slug>.graphql|.get`);
  }
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw problem(`${file} cannot be read`);
  }
  const vars = runVariables(process.cwd());
  const origin = standOrigins(vars).backend;
  const verifySsl = verifiesSsl(vars);
  const graphql = file.endsWith(".graphql");
  if (graphql) {
    await checkQuery(text);
  }
  const answer = graphql
    ? await anonymousRequest(origin, GRAPHQL_PATH, { method: "POST", body: JSON.stringify({ query: text }), verifySsl })
    : await anonymousRequest(origin, getPath(text), { method: "GET", verifySsl });
  if (CREDENTIAL_SHAPE.test(answer.text)) {
    process.stdout.write(`probe: ${answer.status}, the answer looks like a credential, so it is not shown\n`);
    return;
  }
  const shown = answer.text.length > MAX_SHOWN ? `${answer.text.slice(0, MAX_SHOWN)} ...(cut)` : answer.text;
  process.stdout.write(`probe: ${answer.status} (anonymous)\n${shown}\n`);
}

if (basename(process.argv[1] ?? "") === CLI_FILE_NAME) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
