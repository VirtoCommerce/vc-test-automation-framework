import type { HttpResponse } from "./http-response";

import { setTimeout as sleep } from "node:timers/promises";

import { Secret } from "@core/secret";

const RETRY_DELAYS_MS: readonly number[] = [300, 1_000, 2_000];

const DEADLOCK_MESSAGES: readonly RegExp[] = [
  /was deadlocked on lock resources/i,
  /deadlock detected/i,
  /deadlock found when trying to get lock/i,
];

/**
 * Repeats a request while the platform answers `500` with a database deadlock message (SQL Server, PostgreSQL,
 * MySQL), common under parallel load. The victim transaction was rolled back, so retrying is safe even for `POST`.
 * Each retry emits a process warning, keeping deadlocks visible as a platform issue. Used by `HttpClient`.
 *
 * @param send - Called once per attempt, so headers such as tokens are fresh.
 * @param delaysMs - Wait before each retry; the count is the maximum number of retries.
 * @returns The first non-deadlock response, or the last one when every retry deadlocked.
 */
export async function retryOnDeadlock(
  send: () => Promise<HttpResponse>,
  delaysMs: readonly number[] = RETRY_DELAYS_MS,
): Promise<HttpResponse> {
  let response = await send();
  for (const delayMs of delaysMs) {
    if (!isDeadlock(response)) {
      return response;
    }
    process.emitWarning(Secret.mask(`${response.method} ${response.url} → deadlock, retrying in ${delayMs} ms`));
    await sleep(delayMs);
    response = await send();
  }
  return response;
}

function isDeadlock(response: HttpResponse): boolean {
  return response.status === 500 && DEADLOCK_MESSAGES.some((message) => message.test(response.text));
}
