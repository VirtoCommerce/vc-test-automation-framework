import { randomUUID } from "node:crypto";

/**
 * Returns an identifier that no other test uses, for names and codes of test data.
 *
 * @param prefix - What the identifier names, such as `test-cart`.
 * @returns The prefix and eight random characters.
 */
export function uniqueId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
