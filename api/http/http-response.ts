import type { output, ZodType } from "zod";
import type { RecordShape } from "@core/record-shape";
import type { WithRequired } from "@core/required-fields";
import type { HttpMethod } from "./http-method";

import { prettifyError } from "zod";

import { optionalFields, requireFields, requireFieldsOfEach } from "@core/required-fields";
import { Secret } from "@core/secret";

import { HttpError } from "./http-error";

const MAX_BODY_LENGTH = 1_000;

/** Data an {@link HttpResponse} is built from. */
export interface HttpResponseInit {
  readonly method: HttpMethod;
  readonly url: string;
  readonly status: number;
  /** Reason phrase such as `Not Found`; may be empty. */
  readonly statusText: string;
  /** Names in any letter case. */
  readonly headers: Readonly<Record<string, string>>;
  /** Whole body; empty when there is none. */
  readonly text: string;
}

/**
 * HTTP response with its body already read, so it can be checked and parsed repeatedly.
 * `json`/`optionalJson`/`parse` require a 2xx status and `errorJson`/`parseError` a non-2xx one, so a missed
 * status check cannot hide a failure. Every error is an {@link HttpError} quoting the body (first 1000 chars).
 *
 * @example
 * const product = response.parse(ProductSchema);
 * expect(rejected.status).toBe(400);
 * expect(rejected.errorJson()).toMatchObject({ errors: [expect.anything()] });
 */
export class HttpResponse implements HttpResponseInit {
  readonly method: HttpMethod;
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  /** Names in lower case; {@link HttpResponse#header} reads one in any case. */
  readonly headers: Readonly<Record<string, string>>;
  readonly text: string;

  constructor(init: HttpResponseInit) {
    this.method = init.method;
    this.url = init.url;
    this.status = init.status;
    this.statusText = init.statusText;
    this.headers = Object.fromEntries(Object.entries(init.headers).map(([name, value]) => [name.toLowerCase(), value]));
    this.text = init.text;
  }

  /** `true` for a 2xx status. */
  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  /** Reads a header by case-insensitive name; `undefined` when absent. */
  header(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  /**
   * Requires a 2xx status, for responses whose body does not matter; returns this response.
   *
   * @throws HttpError when the status is not 2xx.
   */
  expectOk(): this {
    if (!this.ok) {
      throw this.#error();
    }
    return this;
  }

  /**
   * Requires a 2xx status and parses the body as JSON. `T` is not checked at run time; see {@link HttpResponse#parse}.
   *
   * @throws HttpError when the status is not 2xx or the body is not valid JSON.
   */
  json<T = unknown>(): T {
    this.expectOk();
    return this.#parseText<T>();
  }

  /**
   * Like {@link HttpResponse#json} for lookups that may find nothing: an empty or `null` body gives `undefined`.
   * A 404 throws unless `allow404` is set for endpoints that answer a missing record with 404, so a wrong path
   * or a missing module never passes for "not found".
   *
   * @throws HttpError when the status is not 2xx (or an allowed 404) or the body is not valid JSON.
   */
  optionalJson<T = unknown>(options: { readonly allow404?: boolean } = {}): T | undefined {
    if (options.allow404 === true && this.status === 404) {
      return undefined;
    }
    this.expectOk();
    return this.text === "" ? undefined : (this.#parseText<T | null>() ?? undefined);
  }

  /**
   * {@link HttpResponse#json} checked against a shape: the record has the shape's fields. Errors name the shape and
   * the request, such as `Pricelist from POST /api/pricing/pricelists has no id`.
   *
   * @throws HttpError as {@link HttpResponse#json}; Error when the body is empty or lacks a field.
   */
  record<Data extends object, Field extends keyof Data>(shape: RecordShape<Data, Field>): WithRequired<Data, Field> {
    return requireFields(this.json<Data | null>(), shape.fields, this.#labelOf(shape));
  }

  /**
   * {@link HttpResponse#optionalJson} checked against a shape, for lookups: `undefined` when nothing is found.
   *
   * @throws HttpError as {@link HttpResponse#optionalJson}; Error when a found record lacks a field.
   */
  optionalRecord<Data extends object, Field extends keyof Data>(
    shape: RecordShape<Data, Field>,
    options: { readonly allow404?: boolean } = {},
  ): WithRequired<Data, Field> | undefined {
    return optionalFields(this.optionalJson<Data>(options), shape.fields, this.#labelOf(shape));
  }

  /**
   * A JSON array of records, each checked against a shape; items are reported by position.
   *
   * @throws HttpError as {@link HttpResponse#json}; Error when the list or an item is missing or lacks a field.
   */
  records<Data extends object, Field extends keyof Data>(shape: RecordShape<Data, Field>): WithRequired<Data, Field>[] {
    return requireFieldsOfEach(this.json<(Data | null)[] | null>(), shape.fields, this.#labelOf(shape));
  }

  /**
   * The `results` of a platform search result (`{ results, totalCount }`), each checked against a shape.
   *
   * @throws HttpError as {@link HttpResponse#json}; Error when `results` or an item is missing or lacks a field.
   */
  results<Data extends object, Field extends keyof Data>(shape: RecordShape<Data, Field>): WithRequired<Data, Field>[] {
    const { results } = this.json<{ readonly results?: readonly (Data | null)[] | null }>();
    return requireFieldsOfEach(results, shape.fields, this.#labelOf(shape));
  }

  /**
   * Requires a 2xx status and validates the JSON body with a zod schema, applying its defaults and transforms.
   *
   * @throws HttpError when the status is not 2xx, the body is not JSON, or it fails the schema (every issue listed).
   */
  parse<S extends ZodType>(schema: S): output<S> {
    return this.#check(schema, this.json());
  }

  /**
   * Requires a non-2xx status and parses the error body as JSON, for negative tests. `T` is not checked.
   *
   * @throws HttpError when the status is 2xx or the body is not valid JSON.
   */
  errorJson<T = unknown>(): T {
    if (this.ok) {
      throw this.#error("expected an error response");
    }
    return this.#parseText<T>();
  }

  /**
   * Requires a non-2xx status and validates the JSON error body with a zod schema.
   *
   * @throws HttpError when the status is 2xx, the body is not JSON, or it fails the schema (every issue listed).
   */
  parseError<S extends ZodType>(schema: S): output<S> {
    return this.#check(schema, this.errorJson());
  }

  #check<S extends ZodType>(schema: S, body: unknown): output<S> {
    const result = schema.safeParse(body);
    if (!result.success) {
      throw this.#error(`unexpected response body:\n${prettifyError(result.error)}`);
    }
    return result.data;
  }

  #parseText<T>(): T {
    try {
      return JSON.parse(this.text) as T;
    } catch (error) {
      throw this.#error(`response body is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  #labelOf({ label }: { readonly label: string }): string {
    return `${label} from ${this.method} ${URL.parse(this.url)?.pathname ?? this.url}`;
  }

  #error(reason?: string): HttpError {
    return new HttpError(this.#describe(reason), this.status, this.text);
  }

  #describe(reason?: string): string {
    const summary = `${this.method} ${this.url} → ${this.status} ${this.statusText}`.trimEnd();
    const text = Secret.mask(this.text);
    const body =
      text.length > MAX_BODY_LENGTH ? `${text.slice(0, MAX_BODY_LENGTH)}... (${this.text.length} chars)` : text;
    return [reason ? `${summary}: ${reason}` : summary, body].filter(Boolean).join("\n");
  }
}
