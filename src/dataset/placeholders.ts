import { Secret } from "@/core";

/** The values of the `${ENV:key}` placeholders of a dataset, by key. A `Secret` is revealed where it is filled in. */
export type PlaceholderValues = Readonly<Record<string, string | Secret>>;

/**
 * The functions that return the values of placeholders, by source, such as `ENV` or `RECORD`. A function returns
 * `undefined` or `null` for a key without a value.
 */
export type PlaceholderSources = Readonly<Record<string, (key: string) => unknown>>;

const PLACEHOLDER = /\$\{([A-Z]+):([^}]+)\}/g;

/**
 * Returns the placeholder of a value that a seed run or a dataset load fills in from its placeholder values.
 *
 * @example
 * criteria: { storeId: envPlaceholder("STORE_ID") }
 *
 * @param key - The key of the value, such as `STORE_ID`.
 * @returns The placeholder, such as `${ENV:STORE_ID}`.
 * @throws {Error} The key is empty or contains `}`.
 */
export function envPlaceholder<const TKey extends string>(key: TKey): `\${ENV:${TKey}}` {
  return `\${ENV:${checkedName(key)}}`;
}

/**
 * Returns the placeholder of a field of the record being sent, for the paths and the search criteria of a collection
 * sent one record at a time.
 *
 * @example
 * path: `/api/inventory/products/${recordPlaceholder("productId")}`
 *
 * @param field - The field of the record, such as `code`.
 * @returns The placeholder, such as `${RECORD:code}`.
 * @throws {Error} The field is empty or contains `}`.
 */
export function recordPlaceholder<const TField extends string>(field: TField): `\${RECORD:${TField}}` {
  return `\${RECORD:${checkedName(field)}}`;
}

/**
 * Replaces each placeholder in a text with its value.
 *
 * @remarks
 * The text is read once, so a value that contains a placeholder is not filled in again. A `Secret` value is revealed.
 *
 * @param template - The text with placeholders, such as a path or the content of a data file.
 * @param sources - The functions that return the values, by source.
 * @param encode - Encodes each value for the text, such as `encodeURIComponent` for a path.
 * @returns The text with every placeholder replaced.
 * @throws {Error} A placeholder has an unknown source or no value. The message names the placeholder, not a value.
 */
export function fillPlaceholders(
  template: string,
  sources: PlaceholderSources,
  encode: (value: string) => string,
): string {
  return template.replace(PLACEHOLDER, (placeholder: string, source: string, key: string) => {
    const value = sources[source]?.(key);
    if (value === undefined || value === null) {
      throw new Error(`${placeholder} has no value`);
    }
    return encode(value instanceof Secret ? value.reveal() : String(value));
  });
}

/**
 * Determines whether a text has a placeholder of a source.
 *
 * @param template - The text, such as a path.
 * @param source - The source, such as `RECORD`.
 * @returns `true` if the text has a placeholder of the source; otherwise, `false`.
 */
export function hasPlaceholder(template: string, source: string): boolean {
  return [...template.matchAll(PLACEHOLDER)].some((match) => match[1] === source);
}

/**
 * Escapes a value as the content of a JSON string, without the quotes, so it can be filled into a JSON text.
 *
 * @param value - The value.
 * @returns The escaped value, such as `say \"hi\"` for `say "hi"`.
 */
export function jsonStringContent(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

/**
 * Returns the source of `${ENV:key}` placeholders for a set of placeholder values.
 *
 * @param values - The placeholder values, by key.
 * @returns A function that returns the value of a key, or `undefined` for an unknown key.
 */
export function envSource(values: PlaceholderValues): (key: string) => unknown {
  return function placeholderValue(key: string): unknown {
    return values[key];
  };
}

function checkedName<T extends string>(name: T): T {
  if (name === "" || name.includes("}")) {
    throw new Error(`"${name}" cannot be used in a placeholder`);
  }
  return name;
}
