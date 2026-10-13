/** `T` (usually a generated platform type) with fields `K` read-only and non-nullable. */
export type WithRequired<T, K extends keyof T> = T & { readonly [P in K]-?: NonNullable<T[P]> };

/**
 * Asserts that a value has the listed fields and narrows its type; returns the same object.
 * For the few fields a caller needs from an all-optional generated type; to check a whole response against a
 * schema, use `HttpResponse#parse`. `undefined`, `null` and `""` count as missing.
 *
 * @example
 * const product = requireFields(found, ["id", "code", "name"], `Product "${id}"`);
 * product.id; // string, no longer string | undefined
 *
 * @param label - Starts the error message.
 * @throws Error `"<label> is missing"` for a missing value, or `"<label> has no <fields>"`.
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
 * {@link requireFields} for a lookup result that may be absent: `undefined` passes through unchanged.
 *
 * @example
 * return optionalFields(response.optionalJson<StoreData>(), STORE_FIELDS, `Store "${id}"`);
 *
 * @throws Error `"<label> has no <fields>"` when a present value lacks a field.
 */
export function optionalFields<T extends object, const K extends keyof T>(
  value: T | undefined,
  fields: readonly K[],
  label: string,
): WithRequired<T, K> | undefined {
  return value === undefined ? undefined : requireFields(value, fields, label);
}

/**
 * {@link requireFields} for every item of a list. A missing list throws; pass `list ?? []` when the platform
 * sends `null` for "none".
 *
 * @param label - Names the list; items are reported by 1-based position, such as `"Found page #3"`.
 * @throws Error when the list or an item is missing, or an item lacks a field.
 */
export function requireFieldsOfEach<T extends object, const K extends keyof T>(
  values: readonly (T | null | undefined)[] | null | undefined,
  fields: readonly K[],
  label: string,
): WithRequired<T, K>[] {
  return requireDefined(values, label).map((value, index) => requireFields(value, fields, `${label} #${index + 1}`));
}

/**
 * Asserts that a list is present and has no `undefined` or `null` items; returns a new, narrowed array.
 *
 * @param label - Names the list; items are reported by 1-based position, such as `"Found page #3"`.
 * @throws Error when the list or an item is missing.
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
