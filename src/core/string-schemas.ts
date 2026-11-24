import { number, string, url } from "zod";

import { SECRET_MIN_LENGTH, Secret } from "./secret.ts";

/**
 * A string that has at least one character other than whitespace. The string is not trimmed, so `" pass word "`
 * stays as given.
 */
export const nonBlankString = string().regex(/\S/, "must not be blank");

/**
 * An absolute HTTP or HTTPS URL without a user name or password, because URLs can appear in error messages.
 */
export const absoluteUrl = url({ protocol: /^https?$/ }).refine((value: string) => {
  const parsed = URL.parse(value);
  return parsed === null || (parsed.username === "" && parsed.password === "");
}, "must not contain credentials");

/**
 * An {@link absoluteUrl} without a path, query or fragment, returned as its canonical origin so that origins can be
 * compared with `===`.
 *
 * @remarks
 * A URL with a path is rejected rather than shortened, because requests resolve against the origin only: with
 * `http://host/platform`, a request to `api/x` would go to `http://host/api/x`.
 *
 * @example
 * originUrl.parse("HTTPS://Host:443/"); // "https://host"
 */
export const originUrl = absoluteUrl
  .refine((value: string) => {
    const parsed = URL.parse(value);
    return parsed === null || (parsed.pathname === "/" && parsed.search === "" && parsed.hash === "");
  }, "must be an origin without a path, query or fragment, such as http://localhost:8090")
  .transform((value: string) => new URL(value).origin);

/**
 * A positive integer written in decimal digits, returned as a number. It is meant for environment variables, not for
 * JSON values.
 *
 * @example
 * positiveInt.parse("5000"); // 5000
 */
export const positiveInt = string()
  .regex(/^\d+$/, "must be decimal digits")
  .transform(Number)
  .pipe(number().int().positive());

/**
 * The string `"true"` or `"false"`, returned as a boolean. Any other value, such as `"1"` or `"yes"`, is rejected.
 */
export const booleanString = string()
  .regex(/^(true|false)$/, "must be true or false")
  .transform((value: string) => value === "true");

/**
 * A string of at least {@link SECRET_MIN_LENGTH} characters, returned as a {@link Secret}. Error messages do not
 * contain the value.
 */
export const secretString = string()
  .min(SECRET_MIN_LENGTH, `must have at least ${SECRET_MIN_LENGTH} characters`)
  .transform((value: string) => Secret.of(value));
