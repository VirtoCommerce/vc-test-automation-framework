import type { APIRequestContext, APIResponse } from "@playwright/test";
import type { Authentication } from "./authentication.ts";
import type { HttpMethod } from "./http-method.ts";
import type { HeaderProvider, QueryParams, RequestHeaders, RequestOptions } from "./request-options.ts";

import { errorMessage, maskSecrets, revealedFields, revealedJson, Secret } from "@/core";

import { HttpResponse } from "./http-response.ts";

type FetchOptions = NonNullable<Parameters<APIRequestContext["fetch"]>[1]>;

const JSON_CONTENT_TYPE: RequestHeaders = { "content-type": "application/json" };

/**
 * Represents an immutable HTTP client that sends requests through a request context, so the requests appear in test
 * traces.
 *
 * @remarks
 * - The client sends requests only to its own origin and does not follow redirects, so headers never reach another
 *   host.
 * - The client does not throw for a status. Check the status with {@link HttpResponse.expectOk},
 *   {@link HttpResponse.json}, {@link HttpResponse.parse} or {@link HttpResponse.errorJson}.
 * - The client throws an error, with secrets masked, when no response arrives. It does not retry.
 * - The client reveals each {@link Secret} in the query, headers or body only when it sends the request, so callers
 *   do not call {@link Secret.reveal}.
 *
 * @example
 * const client = new HttpClient(context, baseUrl).withHeaders({ "Accept-Language": "en-US" });
 * const store = (await client.get(`/api/stores/${encodeURIComponent(id)}`)).parse(StoreSchema);
 */
export class HttpClient {
  readonly #context: APIRequestContext;
  readonly #baseUrl: string;
  #headers: HeaderProvider = noHeaders;
  #authentication: Authentication | undefined;

  /**
   * Creates a client that sends requests to one origin.
   *
   * @param context - The request context that sends the requests.
   * @param baseUrl - The origin that requests are sent to, such as `http://localhost:8090`.
   * @throws {Error} `baseUrl` is not a canonical origin. The message does not contain the URL.
   */
  constructor(context: APIRequestContext, baseUrl: string) {
    if (URL.parse(baseUrl)?.origin !== baseUrl) {
      throw new Error("baseUrl must be a canonical origin, such as http://localhost:8090");
    }
    this.#context = context;
    this.#baseUrl = baseUrl;
  }

  /**
   * Returns a client that also sends the specified headers.
   *
   * @remarks
   * The headers replace headers of the same name, except the sign-in headers. A provider is called for each request.
   *
   * @param extra - The headers to send, or a provider that returns them.
   * @returns A new client. This client does not change.
   */
  withHeaders(extra: RequestHeaders | HeaderProvider): HttpClient {
    const provider = typeof extra === "function" ? extra : constantHeaders({ ...extra });
    const parent = this.#headers;
    return this.#derive(async function chained() {
      return mergeHeaders(await parent(), await provider());
    }, this.#authentication);
  }

  /**
   * Returns a client that signs in to each request.
   *
   * @remarks
   * The new client adds the sign-in headers to each request. When a response has a 401 status, the client renews the
   * sign-in and sends the request once more; this also happens when a negative test expects the 401 status. The
   * sign-in replaces any sign-in of this client.
   *
   * @param authentication - The sign-in headers and the way to renew them.
   * @returns A new client. This client does not change.
   */
  withAuthentication(authentication: Authentication): HttpClient {
    return this.#derive(this.#headers, authentication);
  }

  /**
   * Sends a request and returns the response, whatever its status.
   *
   * @remarks
   * A redirect status (3xx) is returned, not followed. With {@link HttpClient.withAuthentication}, a 401 status
   * renews the sign-in, and the request is sent once more.
   *
   * @param method - The HTTP method.
   * @param path - The path of the request, resolved against the base URL.
   * @param options - The query, headers, body and timeout of the request.
   * @returns The response.
   * @throws {Error} The URL is outside the base origin, in which case nothing is sent, or no response arrives. The
   * message has secrets masked.
   */
  async send(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<HttpResponse> {
    const url = this.#url(method, path, options.query);
    const headers = await this.#currentHeaders();
    const response = await this.#request(method, url, options, headers);
    if (response.status !== 401 || this.#authentication === undefined) {
      return response;
    }
    await this.#authentication.renew(headers);
    return this.#request(method, url, options, await this.#currentHeaders());
  }

  /**
   * Sends a `GET` request. See {@link HttpClient.send}.
   *
   * @param path - The path of the request, resolved against the base URL.
   * @param options - The query, headers, body and timeout of the request.
   * @returns The response, whatever its status.
   */
  get(path: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.send("GET", path, options);
  }

  /**
   * Sends a `POST` request. See {@link HttpClient.send}.
   *
   * @param path - The path of the request, resolved against the base URL.
   * @param options - The query, headers, body and timeout of the request.
   * @returns The response, whatever its status.
   */
  post(path: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.send("POST", path, options);
  }

  /**
   * Sends a `PUT` request. See {@link HttpClient.send}.
   *
   * @param path - The path of the request, resolved against the base URL.
   * @param options - The query, headers, body and timeout of the request.
   * @returns The response, whatever its status.
   */
  put(path: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.send("PUT", path, options);
  }

  /**
   * Sends a `PATCH` request. See {@link HttpClient.send}.
   *
   * @param path - The path of the request, resolved against the base URL.
   * @param options - The query, headers, body and timeout of the request.
   * @returns The response, whatever its status.
   */
  patch(path: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.send("PATCH", path, options);
  }

  /**
   * Sends a `DELETE` request. See {@link HttpClient.send}.
   *
   * @param path - The path of the request, resolved against the base URL.
   * @param options - The query, headers, body and timeout of the request.
   * @returns The response, whatever its status.
   */
  delete(path: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.send("DELETE", path, options);
  }

  #derive(headers: HeaderProvider, authentication: Authentication | undefined): HttpClient {
    const client = new HttpClient(this.#context, this.#baseUrl);
    client.#headers = headers;
    client.#authentication = authentication;
    return client;
  }

  async #currentHeaders(): Promise<RequestHeaders> {
    return mergeHeaders(await this.#headers(), (await this.#authentication?.headers()) ?? {});
  }

  #url(method: HttpMethod, path: string, query: QueryParams = {}): string {
    const url = new URL(path, this.#baseUrl);
    if (url.origin !== this.#baseUrl) {
      throw new Error(maskSecrets(`${method} ${url.origin}${url.pathname}: a client only sends to ${this.#baseUrl}`));
    }
    for (const [name, value] of Object.entries(query)) {
      for (const item of value === undefined ? [] : [value].flat()) {
        url.searchParams.append(name, item instanceof Secret ? item.reveal() : String(item));
      }
    }
    return url.href;
  }

  async #request(
    method: HttpMethod,
    url: string,
    options: RequestOptions,
    headers: RequestHeaders,
  ): Promise<HttpResponse> {
    const response = await this.#fetch(url, {
      method,
      headers: revealedFields(mergeHeaders(headersForBody(options, headers), options.headers ?? {})),
      ...bodyOf(options),
      ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
      maxRedirects: 0,
      failOnStatusCode: false,
    });

    try {
      return new HttpResponse({
        method,
        url: maskSecrets(response.url()),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
        text: await response.text(),
      });
    } finally {
      await response.dispose();
    }
  }

  async #fetch(url: string, options: FetchOptions): Promise<APIResponse> {
    try {
      return await this.#context.fetch(url, options);
    } catch (error) {
      throw new Error(maskSecrets(errorMessage(error)));
    }
  }
}

async function noHeaders(): Promise<RequestHeaders> {
  return {};
}

function constantHeaders(headers: RequestHeaders): HeaderProvider {
  return async function provide() {
    return headers;
  };
}

function headersForBody(options: RequestOptions, headers: RequestHeaders): RequestHeaders {
  if (options.json !== undefined) {
    return mergeHeaders(headers, JSON_CONTENT_TYPE);
  }
  if (options.form !== undefined || options.multipart !== undefined) {
    return Object.fromEntries(Object.entries(headers).filter(([name]: [string, unknown]) => name !== "content-type"));
  }
  return headers;
}

function bodyOf(options: RequestOptions): Pick<FetchOptions, "data" | "form" | "multipart"> {
  if (options.json !== undefined) {
    return { data: revealedJson(options.json) };
  }
  if (options.form !== undefined) {
    return { form: revealedFields(options.form) };
  }
  if (options.multipart !== undefined) {
    return { multipart: revealedFields(options.multipart) };
  }
  return {};
}

function mergeHeaders(...sources: readonly RequestHeaders[]): RequestHeaders {
  const merged: Record<string, string | Secret> = {};
  for (const source of sources) {
    for (const [name, value] of Object.entries(source)) {
      merged[name.toLowerCase()] = value;
    }
  }
  return merged;
}
