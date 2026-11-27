import type { Secret } from "@/core";

/** A value of a query parameter. A {@link Secret} is revealed only when the request is sent. */
export type QueryValue = string | number | boolean | Secret;

/** The query parameters of a request. An array repeats the parameter, and `undefined` leaves it out. */
export type QueryParams = Readonly<Record<string, QueryValue | readonly QueryValue[] | undefined>>;

/** The headers of a request. Header names are case-insensitive, and each {@link Secret} is revealed only when sent. */
export type RequestHeaders = Readonly<Record<string, string | Secret>>;

/**
 * Returns request headers. It is called for each request, so values that change, such as a renewed token, are picked
 * up. Return tokens as {@link Secret} values to keep them masked.
 */
export type HeaderProvider = () => Promise<RequestHeaders>;

/** A file in a multipart body. */
export interface MultipartFile {
  /** The file name. */
  readonly name: string;
  /** The media type of the file, such as `text/plain`. */
  readonly mimeType: string;
  /** The content of the file. */
  readonly buffer: Buffer;
}

/** The options that every request accepts, whatever its body. */
export interface RequestBase {
  /** The query parameters, appended to the query of the path. */
  readonly query?: QueryParams;
  /** The headers of this request. They replace headers of the same name from the client. */
  readonly headers?: RequestHeaders;
  /** The time to wait for a response, in milliseconds. */
  readonly timeoutMs?: number;
}

/** The options of a request with a JSON body, or with no body. */
export interface JsonBody {
  /** A body sent as JSON, with the `application/json` content type. */
  readonly json?: unknown;
  /** Not allowed, because a request has at most one body. */
  readonly form?: never;
  /** Not allowed, because a request has at most one body. */
  readonly multipart?: never;
}

/** The options of a request with a URL-encoded form body. */
export interface FormBody {
  /** A body sent as URL-encoded form fields. */
  readonly form: Readonly<Record<string, string | number | boolean | Secret>>;
  /** Not allowed, because a request has at most one body. */
  readonly json?: never;
  /** Not allowed, because a request has at most one body. */
  readonly multipart?: never;
}

/** The options of a request with a multipart body. */
export interface MultipartBody {
  /** A body sent as multipart form data, with text fields and files. */
  readonly multipart: Readonly<Record<string, string | MultipartFile | Secret>>;
  /** Not allowed, because a request has at most one body. */
  readonly json?: never;
  /** Not allowed, because a request has at most one body. */
  readonly form?: never;
}

/**
 * The options of a request. A request has at most one body: `json`, `form` or `multipart`. Each {@link Secret} is
 * revealed only when the request is sent.
 */
export type RequestOptions = RequestBase & (JsonBody | FormBody | MultipartBody);
