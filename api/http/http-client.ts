import type { APIRequestContext, APIResponse } from "@playwright/test";
import type { HttpMethod } from "./http-method";

import { Secret } from "@core/secret";

import { retryOnDeadlock } from "./deadlock-retry";
import { HttpResponse } from "./http-response";

/** Query parameter value; numbers and booleans are sent as text. */
export type QueryValue = string | number | boolean;

/** Query parameters: an array repeats the parameter, `undefined` omits it. */
export type QueryParams = Readonly<Record<string, QueryValue | readonly QueryValue[] | undefined>>;

/** Request headers; names are case-insensitive. */
export type HttpHeaders = Readonly<Record<string, string>>;

/** Returns headers for one request; called per request, so a renewed token is picked up. */
export type HeaderProvider = () => Promise<HttpHeaders>;

/** Renews a sign-in rejected with 401, given the rejected request's headers. */
export type UnauthorizedHandler = (rejectedHeaders: HttpHeaders) => Promise<void>;

/** Sign-in headers sent with every request, and how to renew them after a 401. */
export interface Authentication {
  /** Such as `Authorization`. */
  readonly headers: HeaderProvider;
  /** Called after a 401; the request is then sent once more. */
  readonly renew: UnauthorizedHandler;
}

/** File to upload in a multipart body. */
export interface MultipartFile {
  readonly name: string;
  /** Such as `image/png`. */
  readonly mimeType: string;
  readonly buffer: Buffer;
}

interface RequestBase {
  readonly query?: QueryParams;
  /** Override the client's headers of the same name, in any letter case. */
  readonly headers?: HttpHeaders;
  /** Defaults to the request context's timeout. */
  readonly timeoutMs?: number;
}

interface JsonBody {
  /** Any JSON value, including a plain string; sent with `Content-Type: application/json`. */
  readonly json?: unknown;
  readonly form?: never;
  readonly multipart?: never;
}

interface FormBody {
  /** Sent as `application/x-www-form-urlencoded`. */
  readonly form: Readonly<Record<string, string>>;
  readonly json?: never;
  readonly multipart?: never;
}

interface MultipartBody {
  /** Sent as `multipart/form-data`: text fields and files. */
  readonly multipart: Readonly<Record<string, string | MultipartFile>>;
  readonly json?: never;
  readonly form?: never;
}

/** Per-request options with at most one body: `json`, `form` or `multipart`. */
export type RequestOptions = RequestBase & (JsonBody | FormBody | MultipartBody);

/**
 * Immutable HTTP client over a Playwright request context; paths resolve against its `baseURL`.
 *
 * - Never throws for a status: check with `expectOk()`, `json()`, `parse()` or `errorJson()` on the response.
 * - Throws a plain `Error` (secrets masked) when no response arrives: refused connection, timeout.
 * - Retries database deadlocks ({@link retryOnDeadlock}); with an {@link Authentication}, renews the sign-in
 *   once on 401 and resends.
 *
 * @example
 * const client = new HttpClient(context).withHeaders({ "X-Store": "store-acme" });
 * const product = (await client.get("/api/catalog/products/laptop")).parse(ProductSchema);
 */
export class HttpClient {
  readonly #context: APIRequestContext;
  readonly #headers: HeaderProvider;
  readonly #onUnauthorized: UnauthorizedHandler | undefined;

  /** @param onUnauthorized - Renews the sign-in after a 401; without it a 401 is returned as is. */
  constructor(
    context: APIRequestContext,
    headers: HeaderProvider = noHeaders,
    onUnauthorized: UnauthorizedHandler | undefined = undefined,
  ) {
    this.#context = context;
    this.#headers = headers;
    this.#onUnauthorized = onUnauthorized;
  }

  /**
   * Returns a new client that also sends `extra`, overriding same-named headers in any letter case.
   *
   * @param extra - Fixed headers, or a provider called per request (for a token that may be renewed).
   */
  withHeaders(extra: HttpHeaders | HeaderProvider): HttpClient {
    const extraHeaders: HeaderProvider = typeof extra === "function" ? extra : async () => extra;
    return new HttpClient(
      this.#context,
      async () => mergeHeaders(await this.#headers(), await extraHeaders()),
      this.#onUnauthorized,
    );
  }

  /** Returns a new client that adds the sign-in headers and, on a 401, renews them and resends once. */
  withAuthentication(authentication: Authentication): HttpClient {
    return new HttpClient(
      this.#context,
      async () => mergeHeaders(await this.#headers(), await authentication.headers()),
      authentication.renew,
    );
  }

  /** Sends a `GET` request. See {@link HttpClient#send}. */
  get(path: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.send("GET", path, options);
  }

  /** Sends a `POST` request. See {@link HttpClient#send}. */
  post(path: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.send("POST", path, options);
  }

  /** Sends a `PUT` request. See {@link HttpClient#send}. */
  put(path: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.send("PUT", path, options);
  }

  /** Sends a `PATCH` request. See {@link HttpClient#send}. */
  patch(path: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.send("PATCH", path, options);
  }

  /** Sends a `DELETE` request. See {@link HttpClient#send}. */
  delete(path: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.send("DELETE", path, options);
  }

  /**
   * Sends a request with a method given as data; the get/post/put/patch/delete shortcuts call this.
   *
   * @param path - Resolved against the context's `baseURL`; an absolute URL is used as is.
   * @returns The response whatever its status; after a renewed sign-in, the resent request's response.
   * @throws Error (secrets masked) when no response arrives.
   */
  async send(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<HttpResponse> {
    const first = await this.#attempt(method, path, options);
    if (first.response.status !== 401 || this.#onUnauthorized === undefined) {
      return first.response;
    }
    await this.#onUnauthorized(first.headers);
    return (await this.#attempt(method, path, options)).response;
  }

  async #attempt(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
  ): Promise<{ readonly response: HttpResponse; readonly headers: HttpHeaders }> {
    let headers: HttpHeaders = {};
    const response = await retryOnDeadlock(async () => {
      headers = await this.#headers();
      return this.#request(method, path, options, headers);
    });
    return { response, headers };
  }

  async #request(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
    clientHeaders: HttpHeaders,
  ): Promise<HttpResponse> {
    const response = await this.#fetch(path, {
      method,
      params: toSearchParams(options.query ?? {}),
      headers: mergeHeaders(clientHeaders, options.json === undefined ? {} : JSON_CONTENT_TYPE, options.headers ?? {}),
      // serialised here: Playwright sends a string `data` that parses as JSON as is, so "123" would arrive as 123
      ...(options.json === undefined ? {} : { data: JSON.stringify(options.json) }),
      ...(options.form === undefined ? {} : { form: options.form }),
      ...(options.multipart === undefined ? {} : { multipart: { ...options.multipart } }),
      ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
      failOnStatusCode: false,
    });

    try {
      return new HttpResponse({
        method,
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        text: await response.text(),
      });
    } finally {
      await response.dispose();
    }
  }

  async #fetch(...[path, options]: Parameters<APIRequestContext["fetch"]>): Promise<APIResponse> {
    try {
      return await this.#context.fetch(path, options);
    } catch (error) {
      throw new Error(Secret.mask(error instanceof Error ? error.message : String(error)));
    }
  }
}

const JSON_CONTENT_TYPE: HttpHeaders = { "content-type": "application/json" };

async function noHeaders(): Promise<HttpHeaders> {
  return {};
}

function mergeHeaders(...sources: readonly HttpHeaders[]): HttpHeaders {
  const merged: Record<string, string> = {};
  for (const source of sources) {
    for (const [name, value] of Object.entries(source)) {
      merged[name.toLowerCase()] = value;
    }
  }
  return merged;
}

function toSearchParams(query: QueryParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    for (const item of value === undefined ? [] : [value].flat()) {
      params.append(name, String(item));
    }
  }
  return params;
}
