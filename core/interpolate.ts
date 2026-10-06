export type PlaceholderSource = (key: string) => unknown;

const PLACEHOLDER = /\$\{([A-Z_]+):(\w+)\}/g;

export function interpolate(
  template: string,
  sources: Readonly<Record<string, PlaceholderSource>>,
  encode: (value: string) => string,
): string {
  return template.replace(PLACEHOLDER, (placeholder, source: string, key: string) => {
    const lookup = sources[source];
    if (lookup === undefined) {
      throw new Error(`${placeholder} has an unknown source; known sources: ${Object.keys(sources).join(", ")}`);
    }
    const value = lookup(key);
    if (typeof value !== "string") {
      throw new Error(`${placeholder} has no value`);
    }
    return encode(value);
  });
}

export function jsonStringContent(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}
