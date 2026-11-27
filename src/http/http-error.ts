import { maskSecrets } from "@/core";

/** Represents a response that is not what the caller expected. The message and body have secrets masked. */
export class HttpError extends Error {
  /** The name of the error type, `HttpError`. */
  override readonly name = "HttpError";

  /** The status of the response. */
  readonly status: number;

  /** The body of the response, with secrets masked. */
  readonly body: string;

  /**
   * Creates an error for a response.
   *
   * @param message - The description of the error. Secrets in it are masked.
   * @param status - The status of the response.
   * @param body - The body of the response. Secrets in it are masked.
   * @param options - The options of the error, such as its cause.
   */
  constructor(message: string, status: number, body: string = "", options?: ErrorOptions) {
    super(maskSecrets(message), options);
    this.status = status;
    this.body = maskSecrets(body);
  }

  /**
   * Determines whether a value is an {@link HttpError} with one of the specified statuses.
   *
   * @param error - The value to check.
   * @param statuses - The statuses to match.
   * @returns `true` if the value is an {@link HttpError} and its status is one of `statuses`; otherwise, `false`.
   */
  static hasStatus(error: unknown, ...statuses: readonly number[]): error is HttpError {
    return error instanceof HttpError && statuses.includes(error.status);
  }
}
