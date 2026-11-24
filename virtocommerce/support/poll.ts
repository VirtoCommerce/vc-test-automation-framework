import { setTimeout as sleep } from "node:timers/promises";

/** How long search indexes of the platform may lag behind a change, such as a new pickup location. */
export const INDEX_LAG_TIMEOUT_MS = 60_000;

const DEFAULT_TIMEOUT_MS = 30_000;
const INTERVAL_MS = 500;

/**
 * Reads a value until it is done, for arranging data that the platform shows only after a while.
 *
 * @remarks
 * Use `expect.poll` in assertions; this is for `arrange`, which waits before the test acts.
 *
 * @param read - Reads the value.
 * @param isDone - Whether the value is the awaited one.
 * @param describe - What is awaited, for the error message.
 * @param timeoutMs - How long to wait; 30 seconds by default.
 * @returns The awaited value.
 * @throws {Error} The value is not done in time.
 */
export async function pollUntil<T>(
  read: () => Promise<T>,
  isDone: (value: T) => boolean,
  describe: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (isDone(value)) {
      return value;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeoutMs} ms waiting for ${describe}`);
    }
    await sleep(INTERVAL_MS);
  }
}
