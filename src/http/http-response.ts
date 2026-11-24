import type { output, ZodType } from "zod";
import type { HttpMethod } from "./http-method.ts";

import { prettifyError } from "zod";

import { maskSecrets } from "@/core";

import { HttpError } from "./http-error.ts";

const MAX_BODY_LENGTH = 1_000;

/** The options of {@link HttpResponse.optionalJson} and {@link HttpResponse.parseOptional}. */
export interface OptionalBodyOptions {
  /**
   * Whether a 404 status also means that there is no body, for a server that answers a missing record with 404. The
   * default is `false`, because a server also returns 404 for an unknown route.
   */
  readonly allow404?: boolean | undefined;
}

/** The data that an {@link HttpResponse} is created from. */
export type HttpResponseInit = {
  /** The HTTP method of the request. */
  readonly method: HttpMethod;
  /** The URL that was requested, with secrets masked. */
  readonly url: string;
  /** The status of the response, such as 200. */
  readonly status: number;
  /** The status text of the response, such as `OK`. It can be empty. */
  readonly statusText: string;
  /** The response headers by lowercase name, such as `content-type`. */
  readonly headers: Readonly<Record<string, string>>;
  /** The response body as text. */
  readonly text: string;
};

/**
 * Represents a response whose body has already been read.
 *
 * @remarks
 * {@link HttpResponse.json} and {@link HttpResponse.parse} require a success status (2xx), and
 * {@link HttpResponse.errorJson} requires any other status, so a missed status check cannot hide a failure. Each
 * failure is an {@link HttpError} that quotes the body with secrets masked.
 *
 * @example
 * const store = response.parse(StoreSchema);
 * expect(rejected.status).toBe(400);
 * expect(rejected.errorJson()).toMatchObject({ errors: [expect.anything()] });
 */
export class HttpResponse implements HttpResponseInit {
  /** The HTTP method of the request. */
  readonly method: HttpMethod;
  /** The URL that was requested, with secrets masked. */
  readonly url: string;
  /** The status of the response, such as 200. */
  readonly status: number;
  /** The status text of the response, such as `OK`. It can be empty. */
  readonly statusText: string;
  /** The response headers by lowercase name, such as `content-type`. */
  readonly headers: Readonly<Record<string, string>>;
  /** The response body as text. */
  readonly text: string;

  /**
   * Creates a response from data that has already been read.
   *
   * @param init - The request method and URL, and the status, headers and body of the response.
   */
  constructor(init: HttpResponseInit) {
    this.method = init.method;
    this.url = init.url;
    this.status = init.status;
    this.statusText = init.statusText;
    this.headers = init.headers;
    this.text = init.text;
  }

  /** Gets a value that indicates whether the status is a success status (2xx). */
  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  /**
   * Ensures that the status is a success status (2xx). Use it for responses whose body does not matter.
   *
   * @returns This response.
   * @throws {HttpError} The status is not a success status.
   */
  expectOk(): this {
    if (!this.ok) {
      throw this.toError();
    }
    return this;
  }

  /**
   * Returns the body of a success response, parsed as JSON.
   *
   * @remarks
   * `T` is not checked at run time. To validate the body, use {@link HttpResponse.parse}.
   *
   * @returns The parsed body.
   * @throws {HttpError} The status is not a success status (2xx), or the body is not valid JSON.
   */
  json<T = unknown>(): T {
    return this.expectOk().#parseText<T>();
  }

  /**
   * Returns the body of a success response, validated by a schema, with the schema's defaults and transformations
   * applied.
   *
   * @param schema - The schema that describes the body.
   * @returns The validated body.
   * @throws {HttpError} The status is not a success status (2xx), the body is not valid JSON, or the body does not
   * match the schema. The message lists every mismatch.
   */
  parse<S extends ZodType>(schema: S): output<S> {
    const result = schema.safeParse(this.json());
    if (!result.success) {
      throw this.toError(`unexpected response body:\n${prettifyError(result.error)}`);
    }
    return result.data;
  }

  /**
   * Returns the body of a success response, parsed as JSON, or `undefined` when there is no body: the body is empty or
   * `null`, or, with `allow404`, the status is 404.
   *
   * @remarks
   * `T` is not checked at run time. To validate the body, use {@link HttpResponse.parseOptional}.
   *
   * @example
   * const order = (await client.get(`/api/orders/${id}`)).optionalJson<Order>({ allow404: true });
   *
   * @param options - Whether a 404 status means that there is no body.
   * @returns The parsed body, or `undefined` when there is none.
   * @throws {HttpError} The status is not a success status (2xx), or the body is not valid JSON.
   */
  optionalJson<T = unknown>(options: OptionalBodyOptions = {}): T | undefined {
    return this.#hasNoBody(options) ? undefined : this.json<T>();
  }

  /**
   * Returns the body of a success response validated by a schema, or `undefined` when there is no body: the body is
   * empty or `null`, or, with `allow404`, the status is 404.
   *
   * @param schema - The schema that describes the body.
   * @param options - Whether a 404 status means that there is no body.
   * @returns The validated body, or `undefined` when there is none.
   * @throws {HttpError} The status is not a success status (2xx), the body is not valid JSON, or the body does not
   * match the schema. The message lists every mismatch.
   */
  parseOptional<S extends ZodType>(schema: S, options: OptionalBodyOptions = {}): output<S> | undefined {
    return this.#hasNoBody(options) ? undefined : this.parse(schema);
  }

  /**
   * Returns the body of an error response, parsed as JSON. Use it in negative tests.
   *
   * @remarks
   * `T` is not checked at run time.
   *
   * @returns The parsed body.
   * @throws {HttpError} The status is a success status (2xx), or the body is not valid JSON.
   */
  errorJson<T = unknown>(): T {
    if (this.ok) {
      throw this.toError("expected an error response");
    }
    return this.#parseText<T>();
  }

  /**
   * Creates an error that describes this response, for a check that the response methods do not make, such as a
   * success response whose body reports a failure.
   *
   * @remarks
   * The message has the method, the URL without its query, the status, the reason and the body, shortened to 1,000
   * characters. Secrets are masked.
   *
   * @param reason - Why the response is not what the caller expected.
   * @returns The error, to throw.
   */
  toError(reason?: string): HttpError {
    const summary = `${this.method} ${pathOf(this.url)} → ${this.status} ${this.statusText}`.trimEnd();
    const text = maskSecrets(this.text);
    const body = text.length > MAX_BODY_LENGTH ? `${text.slice(0, MAX_BODY_LENGTH)}... (${text.length} chars)` : text;
    return new HttpError(
      [reason ? `${summary}: ${reason}` : summary, body].filter(Boolean).join("\n"),
      this.status,
      this.text,
    );
  }

  #hasNoBody({ allow404 = false }: OptionalBodyOptions): boolean {
    return (allow404 && this.status === 404) || (this.ok && (this.text === "" || this.text === "null"));
  }

  #parseText<T>(): T {
    try {
      return JSON.parse(this.text) as T;
    } catch {
      throw this.toError("response body is not valid JSON");
    }
  }
}

function pathOf(url: string): string {
  const parsed = URL.parse(url);
  return parsed === null ? (url.split(/[?#]/)[0] ?? url) : `${parsed.origin}${parsed.pathname}`;
}
