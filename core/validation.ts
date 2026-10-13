import type { output, ZodType } from "zod";

import { coerce, prettifyError, string, url } from "zod";

import { Secret } from "./secret";

/** A string with at least one non-whitespace character; not trimmed, so `" pass word "` stays as given. */
export const nonEmptyString = string().regex(/\S/, "must not be blank");

/** An absolute `http(s)` URL without `user:password@`, since URLs end up in error messages. */
export const webUrl = url({ protocol: /^https?$/ }).refine((value) => {
  const parsed = URL.parse(value);
  return parsed === null || (parsed.username === "" && parsed.password === "");
}, "must not contain credentials");

/**
 * A {@link webUrl} with no path, query or fragment, such as `http://localhost:8090`. A base path would be
 * silently dropped: with `http://host/platform`, a request to `/api/x` goes to `http://host/api/x`.
 */
export const originUrl = webUrl.refine((value) => {
  const parsed = URL.parse(value);
  return parsed === null || (parsed.pathname === "/" && parsed.search === "" && parsed.hash === "");
}, "must be an origin without a path, query or fragment, such as http://localhost:8090");

/** A URL path starting with `/`, such as `/apps/page-builder-shell/`. */
export const urlPath = string().startsWith("/");

/** A positive integer coerced from text (`"5000"` → `5000`); for env variables, not JSON. */
export const positiveInt = coerce.number().int().positive();

/** A {@link nonEmptyString} parsed into a {@link Secret}, so the value never prints. */
export const secretString = nonEmptyString.transform((value) => new Secret(value));

/**
 * Parses a value with a zod schema (defaults and transforms applied) or throws a readable error.
 * For the project's own inputs (env, data files, configs); for HTTP responses use `HttpResponse#parse`,
 * which also reports the request and status.
 *
 * @example
 * parseOrThrow(EnvSchema, process.env, "Invalid environment");
 * // Error: Invalid environment:
 * // ✖ must not be blank
 * //   → at ADMIN_PASSWORD
 *
 * @param label - Starts the error message.
 * @throws Error `"<label>:"` followed by every zod issue.
 */
export function parseOrThrow<S extends ZodType>(schema: S, value: unknown, label: string): output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${label}:\n${prettifyError(result.error)}`);
  }
  return result.data;
}
