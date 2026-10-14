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

/**
 * Builds a run-unique person name: the prefix, a space and eight random letters, such as `Customer Kgdafpnm`.
 * Use it for first and last names: xAPI `updateContact`, which the frontend calls when the ship-to address
 * changes, refuses names with digits or dashes.
 *
 * @example
 * uniqueName("Customer"); // "Customer Kgdafpnm"
 */
export function uniqueName(prefix: string): string {
  const letters = randomUUID()
    .replaceAll("-", "")
    .slice(0, 8)
    .replace(/\d/g, (digit) => String.fromCharCode("g".charCodeAt(0) + Number(digit)));
  return `${prefix} ${letters.charAt(0).toUpperCase()}${letters.slice(1)}`;
}
