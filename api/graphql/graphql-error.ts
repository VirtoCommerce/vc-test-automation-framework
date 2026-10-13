import type { output } from "zod";

import { array, looseObject, number, record, string, union, unknown } from "zod";

import { Secret } from "@core/secret";

/** Schema of one GraphQL `errors` entry; extra platform fields are kept. */
export const GraphqlErrorEntrySchema = looseObject({
  message: string(),
  path: array(union([string(), number()])).optional(),
  extensions: record(string(), unknown()).optional(),
});

/** One GraphQL error: `message`, `path`, and details such as `extensions.code`. */
export type GraphqlErrorEntry = output<typeof GraphqlErrorEntrySchema>;

/**
 * Thrown by `GraphqlClient#execute` for GraphQL errors or missing data. The message (secrets masked) lists
 * each error as `- [VALIDATION_ERROR] Quantity must be positive (at addItem)`; raw entries are in `errors`.
 */
export class GraphqlError extends Error {
  override readonly name = "GraphqlError";
  /** Name from the document, or `(anonymous)`. */
  readonly operationName: string;
  readonly status: number;
  /** Entries as the platform returned them. */
  readonly errors: readonly GraphqlErrorEntry[];

  constructor(operationName: string, status: number, errors: readonly GraphqlErrorEntry[]) {
    super(Secret.mask(describeFailure(operationName, status, errors)));
    this.operationName = operationName;
    this.status = status;
    this.errors = errors;
  }
}

function describeFailure(operationName: string, status: number, errors: readonly GraphqlErrorEntry[]): string {
  const summary = `GraphQL operation ${operationName} returned ${errors.length} error(s) with status ${status}:`;
  return [summary, ...errors.map(describeEntry)].join("\n");
}

function describeEntry(entry: GraphqlErrorEntry): string {
  const code = entry.extensions?.["code"];
  const prefix = typeof code === "string" ? `[${code}] ` : "";
  const location = entry.path === undefined ? "" : ` (at ${entry.path.join(".")})`;
  return `  - ${prefix}${entry.message}${location}`;
}
