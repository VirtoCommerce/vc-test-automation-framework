/**
 * Returns the message of a thrown value.
 *
 * @example
 * throw new Error(`Reading the modules failed: ${errorMessage(error)}`, { cause: error });
 *
 * @param error - The thrown value: an `Error`, or anything else.
 * @returns The message of an `Error`, or the value as a string.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
