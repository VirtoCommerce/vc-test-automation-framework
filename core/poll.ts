import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_INTERVAL_MS = 500;

/**
 * How long the platform's search index may take to show a change (members, addresses, pickup locations).
 * Use it for every wait on index-backed reads, so one number tunes them all.
 */
export const INDEX_LAG_TIMEOUT_MS = 60_000;

/** Options of {@link pollUntil}. */
export interface PollOptions {
  /** What is awaited, quoted in the timeout error, such as `"pickup location Sameday is searchable"`. */
  readonly describe: string;
  /** Default `30000`. */
  readonly timeoutMs?: number;
  /** Pause between reads; default `500`. */
  readonly intervalMs?: number;
}

/**
 * Calls `read` until `isDone` accepts the value, and returns that value. For platform state that settles
 * later: search indexing, e-mails, background jobs.
 *
 * @example
 * const locations = await pollUntil(read, (found) => found.length === 2, { describe: "both pickup locations" });
 *
 * @throws Error `"Timed out after <ms> ms waiting for <describe>"`; errors from `read` propagate immediately.
 */
export async function pollUntil<T>(
  read: () => Promise<T>,
  isDone: (value: T) => boolean,
  { describe, timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = DEFAULT_INTERVAL_MS }: PollOptions,
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
    await sleep(intervalMs);
  }
}
