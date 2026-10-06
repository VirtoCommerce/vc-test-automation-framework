export class HttpError extends Error {
  override readonly name = "HttpError";
  readonly status: number;

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }
}

export function isClientError(error: unknown): error is HttpError {
  return error instanceof HttpError && error.status >= 400 && error.status < 500;
}
