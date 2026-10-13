import { randomUUID } from "node:crypto";

/**
 * Builds a run-unique id for records a test creates: the prefix plus eight random hex characters.
 * Use a descriptive prefix so leftover records are easy to recognise.
 *
 * @example
 * uniqueId("test-cart"); // "test-cart-3f9a1c2e"
 */
export function uniqueId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
