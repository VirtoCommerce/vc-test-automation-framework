import type { output } from "zod";
import type { SecretsAllowed } from "@/core";
import type { HttpClient, HttpResponse } from "@/http";
import type { GraphqlErrorEntry } from "./graphql-error.ts";

import { array, looseObject, unknown } from "zod";

import { GraphqlError, graphqlErrorEntrySchema } from "./graphql-error.ts";

const DEFAULT_PATH = "/graphql";
const ANONYMOUS_OPERATION = "(anonymous)";
const OPERATION_NAME = /\b(?:query|mutation|subscription)\s+([A-Za-z_]\w*)/;

const graphqlResponseSchema = looseObject({
  data: unknown().optional(),
  errors: array(graphqlErrorEntrySchema).optional(),
});

type GraphqlBody = output<typeof graphqlResponseSchema>;

/**
 * An operation document typed with its result and variables, such as a document that GraphQL Code Generator creates
 * in the string document mode.
 *
 * @remarks
 * A test suite passes its generated documents directly. The framework reads only the text of the document, so it does
 * not need a GraphQL package.
 */
export interface GraphqlDocument<TResult, TVariables> {
  /** Carries the result and variable types of the document. It is never called. */
  readonly __apiType?: (variables: TVariables) => TResult;

  /**
   * Returns the text of the document.
   *
   * @returns The text of the document.
   */
  toString(): string;
}

/**
 * The variables argument of an operation. It is optional only when the operation has no required variables, and each
 * string in it can be a `Secret`.
 */
export type GraphqlVariablesArgument<TVariables> =
  Record<string, never> extends TVariables
    ? [variables?: SecretsAllowed<TVariables>]
    : [variables: SecretsAllowed<TVariables>];

/** The complete result of a GraphQL operation, including its errors. */
export interface GraphqlResult<TResult> {
  /** The name of the operation, taken from the document, or `(anonymous)` for an operation without a name. */
  readonly operationName: string;
  /** The HTTP status of the response. */
  readonly status: number;
  /** The data of the response, or `null` when the response has no data. */
  readonly data: TResult | null;
  /** The error entries of the response. It is empty when the response has no errors. */
  readonly errors: readonly GraphqlErrorEntry[];
}

/**
 * Represents a client that runs typed GraphQL operations.
 *
 * @remarks
 * The client reads GraphQL errors from a response with any status, because a server can return them with a success
 * status or, for an invalid operation, with a 400 status. A failed status without GraphQL errors is an HTTP error.
 *
 * @example
 * const graphql = new GraphqlClient(signedInClient);
 * const { cart } = await graphql.execute(GetCartDocument, { storeId, userId, currencyCode, cultureName });
 */
export class GraphqlClient {
  readonly #httpClient: HttpClient;
  readonly #path: string;

  /**
   * Creates a GraphQL client.
   *
   * @param httpClient - The client that sends the operations, usually signed in.
   * @param path - The path of the GraphQL endpoint. The default is `/graphql`.
   */
  constructor(httpClient: HttpClient, path: string = DEFAULT_PATH) {
    this.#httpClient = httpClient;
    this.#path = path;
  }

  /**
   * Runs an operation and returns its data.
   *
   * @param document - The operation document.
   * @param variables - The variables of the operation.
   * @returns The data of the response.
   * @throws {GraphqlError} The response has GraphQL errors, even with partial data, or has no data.
   * @throws {HttpError} The status is a failed status without GraphQL errors, or the body is not a GraphQL response.
   */
  async execute<TResult, TVariables>(
    document: GraphqlDocument<TResult, TVariables>,
    ...variables: GraphqlVariablesArgument<TVariables>
  ): Promise<TResult> {
    const result = await this.executeRaw(document, ...variables);
    if (result.errors.length > 0 || result.data === null) {
      throw new GraphqlError(result.operationName, result.status, result.errors);
    }
    return result.data;
  }

  /**
   * Runs an operation and returns its complete result without throwing for GraphQL errors. Use it in tests that check
   * errors or partial data.
   *
   * @param document - The operation document.
   * @param variables - The variables of the operation.
   * @returns The data, the errors and the status of the response.
   * @throws {HttpError} The status is a failed status without GraphQL errors, or the body is not a GraphQL response.
   */
  async executeRaw<TResult, TVariables>(
    document: GraphqlDocument<TResult, TVariables>,
    ...[variables]: GraphqlVariablesArgument<TVariables>
  ): Promise<GraphqlResult<TResult>> {
    const query = document.toString();
    const name = OPERATION_NAME.exec(query)?.[1];
    const response = await this.#httpClient.post(this.#path, {
      json: { query, operationName: name, variables: variables ?? {} },
    });
    const body = graphqlBodyOf(response);
    return {
      operationName: name ?? ANONYMOUS_OPERATION,
      status: response.status,
      data: (body.data ?? null) as TResult | null,
      errors: body.errors ?? [],
    };
  }
}

function graphqlBodyOf(response: HttpResponse): GraphqlBody {
  if (!response.ok) {
    const failed = graphqlResponseSchema.safeParse(response.errorJson());
    if (failed.success && (failed.data.errors?.length ?? 0) > 0) {
      return failed.data;
    }
  }
  return response.parse(graphqlResponseSchema);
}
