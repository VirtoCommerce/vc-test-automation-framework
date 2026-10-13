/** Looks up a placeholder key; any non-string result (such as `undefined`) means "no value". */
export type PlaceholderSource = (key: string) => unknown;

const PLACEHOLDER = /\$\{([^}]*)\}/g;

/**
 * Replaces every `${SOURCE:key}` in a text with the value from the named source, passed through `encode`.
 * Strict: a malformed placeholder, unknown source or non-string value throws, so typos never reach the platform.
 *
 * @example
 * interpolate("/api/stores/${ENV:STORE_ID}", { ENV: (key) => env[key] }, encodeURIComponent);
 * // "/api/stores/store-acme"
 *
 * @param sources - Lookups by source name, such as `ENV` or `RECORD`.
 * @param encode - Escapes each value: `encodeURIComponent` for a path, {@link jsonStringContent} for JSON.
 * @throws Error naming the offending placeholder.
 */
export function interpolate(
  template: string,
  sources: Readonly<Record<string, PlaceholderSource>>,
  encode: (value: string) => string,
): string {
  return template.replace(PLACEHOLDER, (placeholder, body: string) => {
    const separator = body.indexOf(":");
    if (separator <= 0 || separator === body.length - 1) {
      throw new Error(`${placeholder} is not a placeholder of the form \${SOURCE:key}`);
    }
    const source = body.slice(0, separator);
    const lookup = sources[source];
    if (lookup === undefined) {
      throw new Error(`${placeholder} has an unknown source; known sources: ${Object.keys(sources).join(", ")}`);
    }
    const value = lookup(body.slice(separator + 1));
    if (typeof value !== "string") {
      throw new Error(`${placeholder} has no value`);
    }
    return encode(value);
  });
}

/** Escapes a value for use inside a JSON string literal; returns it without the surrounding quotes. */
export function jsonStringContent(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}
