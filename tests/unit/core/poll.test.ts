import { expect, test } from "@playwright/test";

import { pollUntil } from "@core/poll";

const FAST = { timeoutMs: 200, intervalMs: 5 } as const;

test.describe("pollUntil", () => {
  test("returns the first value that is done", async () => {
    const values = [1, 2, 3, 4];
    let reads = 0;

    const value = await pollUntil(
      async () => values[reads++],
      (current) => current === 3,
      { ...FAST, describe: "three" },
    );

    expect(value).toBe(3);
    expect(reads).toBe(3);
  });

  test("names what it waited for when the value never comes", async () => {
    await expect(
      pollUntil(
        async () => 0,
        () => false,
        { ...FAST, describe: "the pickup location" },
      ),
    ).rejects.toThrow(`Timed out after ${FAST.timeoutMs} ms waiting for the pickup location`);
  });

  test("passes an error of the read on at once", async () => {
    let reads = 0;
    const failing = pollUntil(
      async () => {
        reads += 1;
        throw new Error("platform answered 500");
      },
      () => true,
      { ...FAST, describe: "anything" },
    );

    await expect(failing).rejects.toThrow("platform answered 500");
    expect(reads).toBe(1);
  });
});
