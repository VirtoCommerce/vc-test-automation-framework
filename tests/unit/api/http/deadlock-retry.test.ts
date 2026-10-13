import type { HttpResponseInit } from "@api/http/http-response";

import { expect, test } from "@playwright/test";

import { retryOnDeadlock } from "@api/http/deadlock-retry";
import { HttpResponse } from "@api/http/http-response";
import { MASK, Secret } from "@core/secret";

import { capturedWarnings } from "../../captured-warnings";

const NO_DELAYS = [0, 0, 0];

const DEADLOCKS = {
  "SQL Server": "Transaction (Process ID 61) was deadlocked on lock resources with another process",
  PostgreSQL: "40P01: deadlock detected",
  MySQL: "Deadlock found when trying to get lock; try restarting transaction",
} as const;

function response(init: Partial<HttpResponseInit> = {}): HttpResponse {
  return new HttpResponse({
    method: "POST",
    url: "http://localhost/api/orders",
    status: 200,
    statusText: "",
    headers: {},
    text: "{}",
    ...init,
  });
}

function deadlock(message: string = DEADLOCKS.PostgreSQL): HttpResponse {
  return response({ status: 500, text: JSON.stringify({ message }) });
}

function answers(...responses: readonly HttpResponse[]): { readonly send: () => Promise<HttpResponse>; calls: number } {
  const queue = [...responses];
  const sender = {
    calls: 0,
    async send(): Promise<HttpResponse> {
      sender.calls++;
      const next = queue.shift();
      if (next === undefined) {
        throw new Error("no more answers");
      }
      return next;
    },
  };
  return sender;
}

test.describe("retryOnDeadlock", () => {
  test("returns an answer that is not a deadlock at once", async () => {
    const ok = response();
    const sender = answers(ok);

    expect(await retryOnDeadlock(sender.send, NO_DELAYS)).toBe(ok);
    expect(sender.calls).toBe(1);
  });

  for (const [database, message] of Object.entries(DEADLOCKS)) {
    test(`repeats a request aborted as a ${database} deadlock`, async () => {
      const ok = response();
      const sender = answers(deadlock(message), ok);

      expect(await retryOnDeadlock(sender.send, NO_DELAYS)).toBe(ok);
      expect(sender.calls).toBe(2);
    });
  }

  test("returns the last deadlock when every retry deadlocked too", async () => {
    const last = deadlock();
    const sender = answers(deadlock(), deadlock(), last);

    expect(await retryOnDeadlock(sender.send, [0, 0])).toBe(last);
    expect(sender.calls).toBe(3);
  });

  for (const [title, answer] of [
    ["another server error", response({ status: 500, text: '{"message":"NullReferenceException"}' })],
    ["a deadlock message with a client error status", response({ status: 400, text: "deadlock detected" })],
  ] as const) {
    test(`does not repeat ${title}`, async () => {
      const sender = answers(answer);

      expect(await retryOnDeadlock(sender.send, NO_DELAYS)).toBe(answer);
      expect(sender.calls).toBe(1);
    });
  }

  test("waits the given delay before a retry", async () => {
    const sender = answers(deadlock(), response());
    const startedAt = Date.now();

    await retryOnDeadlock(sender.send, [200]);

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(190);
  });

  test("warns about every retry with the request and masks known secrets in it", async () => {
    const token = new Secret("deadlock-retry-token-1");
    const url = `http://localhost/api/orders?access_token=${token.reveal()}`;
    const sender = answers(response({ ...deadlock(), url }), response({ ...deadlock(), url }), response());
    const warnings = capturedWarnings();

    try {
      await retryOnDeadlock(sender.send, [0, 0]);
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      warnings.stop();
    }

    expect(warnings.messages).toEqual([
      `POST http://localhost/api/orders?access_token=${MASK} → deadlock, retrying in 0 ms`,
      `POST http://localhost/api/orders?access_token=${MASK} → deadlock, retrying in 0 ms`,
    ]);
  });
});
