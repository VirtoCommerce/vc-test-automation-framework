/** A type whose given fields are present and not `null`. */
export type WithRequired<T, K extends keyof T> = T & { readonly [P in K]-?: NonNullable<T[P]> };

/**
 * Returns a value whose fields must be present, typed with them; xAPI and REST types mark most fields optional.
 *
 * @example
 * const cart = requireFields(addItem, ["id"], "Cart");
 *
 * @param value - The value, such as a mutation result.
 * @param fields - The fields that must be present and not empty.
 * @param label - What the value is, for the error message.
 * @returns The value, typed with the fields.
 * @throws {Error} The value or a field is missing.
 */
export function requireFields<T extends object, const K extends keyof T>(
  value: T | null | undefined,
  fields: readonly K[],
  label: string,
): WithRequired<T, K> {
  if (value === undefined || value === null) {
    throw new Error(`${label} is missing`);
  }
  const missing = fields.filter((field) => isMissing(value[field]));
  if (missing.length > 0) {
    throw new Error(`${label} has no ${missing.map(String).join(", ")}`);
  }
  return value as WithRequired<T, K>;
}

/**
 * Returns the entries of a list that must be present, without `null` entries.
 *
 * @param values - The list, such as the sections of a product configuration.
 * @param label - What an entry is, for the error message.
 * @returns The entries.
 * @throws {Error} The list or an entry is missing.
 */
export function requireDefined<T>(values: readonly (T | null | undefined)[] | null | undefined, label: string): T[] {
  if (values === undefined || values === null) {
    throw new Error(`${label} is missing`);
  }
  return values.map((value, index) => {
    if (value === undefined || value === null) {
      throw new Error(`${label} #${index + 1} is missing`);
    }
    return value;
  });
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}
