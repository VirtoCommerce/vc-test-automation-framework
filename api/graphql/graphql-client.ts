import type { DocumentTypeDecoration } from "@graphql-typed-document-node/core";
import type { HttpClient } from "../http/http-client";
import type { GraphqlErrorEntry } from "./graphql-error";

import { array, looseObject, unknown } from "zod";

import { GraphqlError, GraphqlErrorEntrySchema } from "./graphql-error";

/** Generated operation document (from `api/graphql/generated`), typed with result `R` and variables `V`. */
export type GraphqlDocument<R, V> = DocumentTypeDecoration<R, V> & { toString(): string };

type VariablesArg<V> = Record<string, never> extends V ? [variables?: V] : [variables: V];

/** Raw outcome of one operation, errors included; returned by {@link GraphqlClient#executeRaw}. */
export interface GraphqlResult<R> {
  /** Name from the document, or `(anonymous)`. */
  readonly operationName: string;
  readonly status: number;
  /** `null` when the platform returned no data. */
  readonly data: R | null;
  /** Empty when there are none. */
  readonly errors: readonly GraphqlErrorEntry[];
}

const GraphqlResponseSchema = looseObject({
  data: unknown().optional(),
  errors: array(GraphqlErrorEntrySchema).optional(),
});

const GRAPHQL_PATH = "/graphql";
const ANONYMOUS_OPERATION = "(anonymous)";
const OPERATION_NAME = /\b(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/;

/**
 * Runs typed xAPI operations against `POST /graphql`; variables are required only if the operation has required ones.
 * GraphQL errors are read under any HTTP status; an error status without them is an `HttpError`.
 *
 * @example
 * const graphql = new GraphqlClient(signedInHttpClient);
 * const { cart } = await graphql.execute(GetCartDocument, { storeId, userId, currencyCode, cultureName });
 */
export class GraphqlClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  /**
   * Runs an operation and returns its data.
   *
   * @throws GraphqlError when the platform returns GraphQL errors or no data; test with `toBeGraphqlError`.
   * @throws HttpError when the request fails without GraphQL errors.
   */
  async execute<R, V>(document: GraphqlDocument<R, V>, ...variables: VariablesArg<V>): Promise<R> {
    const result = await this.executeRaw(document, ...variables);
    if (result.errors.length > 0) {
      throw new GraphqlError(result.operationName, result.status, result.errors);
    }
    if (result.data === null) {
      throw new GraphqlError(result.operationName, result.status, [{ message: "response has no data" }]);
    }
    return result.data;
  }

  /**
   * Runs an operation and returns data, errors and status without throwing on GraphQL errors, for tests that
   * inspect partial data or several errors. Prefer `execute` with `rejects.toBeGraphqlError` for a plain failure.
   *
   * @throws HttpError when the request fails without GraphQL errors.
   */
  async executeRaw<R, V>(document: GraphqlDocument<R, V>, ...[variables]: VariablesArg<V>): Promise<GraphqlResult<R>> {
    const query = document.toString();
    const operationName = OPERATION_NAME.exec(query)?.[1];

    const response = await this.#httpClient.post(GRAPHQL_PATH, {
      json: { query, operationName, variables: variables ?? {} },
    });
    const body = response.ok ? response.parse(GraphqlResponseSchema) : response.parseError(GraphqlResponseSchema);
    const errors = body.errors ?? [];
    if (errors.length === 0) {
      response.expectOk();
    }

    return {
      operationName: operationName ?? ANONYMOUS_OPERATION,
      status: response.status,
      data: (body.data ?? null) as R | null,
      errors,
    };
  }
}
