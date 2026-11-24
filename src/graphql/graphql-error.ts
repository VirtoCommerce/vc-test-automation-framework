import { array, looseObject, number, record, string, union, unknown } from "zod";

import { maskSecrets } from "@/core";

/** An entry of the `errors` array of a GraphQL response. Fields that the server adds are kept. */
export interface GraphqlErrorEntry {
  /** The description of the error. */
  readonly message: string;
  /** The path of the response field that failed, such as `["cart", "items", 0]`. */
  readonly path?: readonly (string | number)[] | undefined;
  /** Additional data about the error, such as its `code`. */
  readonly extensions?: Readonly<Record<string, unknown>> | undefined;
  /** Other fields that the server adds, such as `locations`. */
  readonly [field: string]: unknown;
}

/** The schema of a {@link GraphqlErrorEntry}. Fields that the server adds are kept. */
export const graphqlErrorEntrySchema = looseObject({
  message: string(),
  path: array(union([string(), number()])).optional(),
  extensions: record(string(), unknown()).optional(),
});

/**
 * Represents a GraphQL response that has errors or has no data. The message and the error entries have secrets masked.
 *
 * @remarks
 * The message names the operation and the status, then lists each error with its code and path, such as
 * `- [VALIDATION_ERROR] Quantity must be positive (at addItem)`.
 */
export class GraphqlError extends Error {
  /** The name of the error type, `GraphqlError`. */
  override readonly name = "GraphqlError";

  /** The name of the operation, taken from the document, or `(anonymous)` for an operation without a name. */
  readonly operationName: string;

  /** The HTTP status of the response. */
  readonly status: number;

  /**
   * The error entries of the response, with secrets masked. It is empty when the response has no errors and no data.
   */
  readonly errors: readonly GraphqlErrorEntry[];

  /**
   * Creates an error for a GraphQL response.
   *
   * @param operationName - The name of the operation, or `(anonymous)`.
   * @param status - The HTTP status of the response.
   * @param errors - The error entries of the response, or an empty array when the response has no data. Secrets in
   * them are masked.
   */
  constructor(operationName: string, status: number, errors: readonly GraphqlErrorEntry[]) {
    super(maskSecrets([summaryOf(operationName, status, errors), ...errors.map(lineOf)].join("\n")));
    this.operationName = operationName;
    this.status = status;
    this.errors = JSON.parse(maskSecrets(JSON.stringify(errors))) as readonly GraphqlErrorEntry[];
  }

  /**
   * Determines whether a value is a {@link GraphqlError} with an error entry that has one of the specified codes.
   *
   * @param error - The value to check.
   * @param codes - The codes to match against `extensions.code`.
   * @returns `true` if the value is a {@link GraphqlError} and one of its entries has one of `codes`; otherwise,
   * `false`.
   */
  static hasCode(error: unknown, ...codes: readonly string[]): error is GraphqlError {
    return (
      error instanceof GraphqlError &&
      error.errors.some((entry: GraphqlErrorEntry) => {
        const code = codeOf(entry);
        return code !== undefined && codes.includes(code);
      })
    );
  }
}

function summaryOf(operationName: string, status: number, errors: readonly GraphqlErrorEntry[]): string {
  if (errors.length === 0) {
    return `GraphQL operation ${operationName} returned no data with status ${status}`;
  }
  const count = errors.length === 1 ? "1 error" : `${errors.length} errors`;
  return `GraphQL operation ${operationName} returned ${count} with status ${status}:`;
}

function lineOf(entry: GraphqlErrorEntry): string {
  const code = codeOf(entry);
  const prefix = code === undefined ? "" : `[${code}] `;
  const location = entry.path === undefined ? "" : ` (at ${entry.path.join(".")})`;
  return `  - ${prefix}${entry.message}${location}`;
}

function codeOf(entry: GraphqlErrorEntry): string | undefined {
  const code = entry.extensions?.["code"];
  return typeof code === "string" ? code : undefined;
}
