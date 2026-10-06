export type WithRequired<T, K extends keyof T> = T & { readonly [P in K]-?: NonNullable<T[P]> };

export function requireFields<T extends object, const K extends keyof T>(
  value: T | null | undefined,
  fields: readonly K[],
  label: string,
): WithRequired<T, K> {
  if (value === undefined || value === null) {
    throw new Error(`${label} is missing`);
  }
  const missing = fields.filter((field) => value[field] === undefined || value[field] === null);
  if (missing.length > 0) {
    throw new Error(`${label} has no ${missing.map(String).join(", ")}`);
  }
  return value as WithRequired<T, K>;
}

export function requireEach<T extends object, const K extends keyof T>(
  values: readonly T[] | null | undefined,
  fields: readonly K[],
  label: string,
): WithRequired<T, K>[] {
  return (values ?? []).map((value) => requireFields(value, fields, label));
}

export function requireItems<T>(values: readonly (T | null | undefined)[] | null | undefined, label: string): T[] {
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
