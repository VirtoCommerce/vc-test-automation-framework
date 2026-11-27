import type { Credentials } from "./credentials.ts";

import { createHash } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const LOCK_DIRECTORY = join(tmpdir(), "vc-test-automation-framework", "sign-in-locks");
const POLL_INTERVAL_MS = 50;
const STALE_AFTER_MS = 60_000;

/**
 * Runs a sign-in while no other process on the machine signs in the same user in the same store.
 *
 * @remarks
 * - The platform returns a 500 status when the same user signs in concurrently, and Playwright workers are separate
 *   processes. A lock directory in the temporary directory of the system serializes their sign-ins.
 * - A lock older than a minute is taken over, because its process ended without releasing it.
 *
 * @param credentials - The user who signs in. The user name and store identify the lock.
 * @param signIn - The sign-in.
 * @returns The result of the sign-in.
 */
export async function withSignInLock<T>(credentials: Credentials, signIn: () => Promise<T>): Promise<T> {
  const lock = join(LOCK_DIRECTORY, lockName(credentials));
  await acquire(lock);
  try {
    return await signIn();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

async function acquire(lock: string): Promise<void> {
  await mkdir(LOCK_DIRECTORY, { recursive: true });
  for (;;) {
    try {
      await mkdir(lock);
      return;
    } catch (error) {
      if (!hasCode(error, "EEXIST")) {
        throw error;
      }
    }
    if (await isStale(lock)) {
      await rm(lock, { recursive: true, force: true });
    } else {
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function isStale(lock: string): Promise<boolean> {
  try {
    return Date.now() - (await stat(lock)).mtimeMs > STALE_AFTER_MS;
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

function lockName({ username, storeId }: Credentials): string {
  return createHash("sha256")
    .update(`${storeId ?? ""}\n${username.toLowerCase()}`)
    .digest("hex");
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
