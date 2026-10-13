import type { Response } from "@playwright/test";

const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

/** Attribute values to match; an `undefined` value leaves its attribute out. */
export type AttributeFilter = Readonly<Record<string, string | undefined>>;

/**
 * Builds a CSS selector requiring every given attribute value exactly; empty when all values are `undefined`.
 *
 * @example
 * attributeSelector({ "data-country": "Canada", "data-city": undefined }); // [data-country="Canada"]
 */
export function attributeSelector(attributes: AttributeFilter): string {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `[${name}=${JSON.stringify(value)}]`)
    .join("");
}

/** `hasText` pattern matching the whole text exactly, ignoring surrounding white space. */
export function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`);
}

/** `hasText` pattern matching text that starts with `value` as a whole word, such as `Memory` in `Memory *`. */
export function startsWithText(value: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(value)}(?![\\p{L}\\p{N}])`, "u");
}

/**
 * Response predicate for a GraphQL operation (batched requests included), to wait on what a click sends.
 *
 * @example
 * await Promise.all([page.waitForResponse(isGraphqlOperation("AddWishlist")), saveButton.click()]);
 */
export function isGraphqlOperation(operationName: string): (response: Response) => boolean {
  return (response) => {
    const request = response.request();
    if (request.method() !== "POST" || !request.url().includes("/graphql")) {
      return false;
    }
    const body = parsedBody(request.postData());
    return (Array.isArray(body) ? body : [body]).some(
      (entry: unknown) =>
        typeof entry === "object" && entry !== null && Reflect.get(entry, "operationName") === operationName,
    );
  };
}

function parsedBody(text: string | null): unknown {
  try {
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(REGEXP_SPECIAL_CHARACTERS, "\\$&");
}
