import { Secret } from "@core/secret";

/**
 * Unexpected response: a non-2xx status, or a body not matching what the caller expected. The message names
 * the request, status and body with {@link Secret}s masked. Network failures are plain `Error`s instead.
 *
 * @example
 * try {
 *   (await client.get("/api/catalog/products/unknown")).json();
 * } catch (error) {
 *   if (!HttpError.hasStatus(error, 404)) {
 *     throw error;
 *   }
 * }
 */
export class HttpError extends Error {
  override readonly name = "HttpError";

  readonly status: number;
  /** Response body with secrets masked; empty when the error has none. */
  readonly body: string;

  constructor(message: string, status: number, body = "") {
    super(Secret.mask(message));
    this.status = status;
    this.body = Secret.mask(body);
  }

  /** Tells whether `error` is an `HttpError` with a 4xx status, i.e. retrying the same request will not help. */
  static isClientError(error: unknown): error is HttpError {
    return error instanceof HttpError && error.status >= 400 && error.status < 500;
  }

  /** Tells whether `error` is an `HttpError` with one of `statuses` (always `false` when none are given). */
  static hasStatus(error: unknown, ...statuses: readonly number[]): error is HttpError {
    return error instanceof HttpError && statuses.includes(error.status);
  }
}
