import { Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";

import { expect, test } from "@playwright/test";

import { Logger } from "@core/logger";
import { MASK, Secret } from "@core/secret";

function capture(): { readonly stream: Writable; readonly lines: () => string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });
  return { stream, lines: () => stripVTControlCharacters(chunks.join("")).split("\n").slice(0, -1) };
}

function utcTime(): string {
  return new Date().toISOString().slice(11, 19);
}

test.describe("Logger", () => {
  for (const [level, label] of [
    ["info", "INFO"],
    ["success", "SUCCESS"],
    ["warn", "WARN"],
    ["error", "ERROR"],
  ] as const) {
    test(`writes a ${level} line with the time, scope and label`, () => {
      const { stream, lines } = capture();

      new Logger("seed", stream)[level]("products: 179 of 179");

      expect(lines()).toEqual([
        expect.stringMatching(new RegExp(`^\\d{2}:\\d{2}:\\d{2} \\[seed\\] ${label} products: 179 of 179$`)),
      ]);
    });
  }

  test("stamps each line with the current UTC time", () => {
    const { stream, lines } = capture();
    const before = utcTime();

    new Logger("seed", stream).info("message");

    const after = utcTime();
    expect([before, after]).toContain(lines()[0]?.slice(0, 8));
  });

  test("writes one line per message, in order", () => {
    const { stream, lines } = capture();
    const logger = new Logger("seed", stream);

    logger.info("first");
    logger.warn("second");
    logger.success("third");

    expect(lines().map((line) => line.slice(9))).toEqual([
      "[seed] INFO first",
      "[seed] WARN second",
      "[seed] SUCCESS third",
    ]);
  });

  test("writes the message as given", () => {
    const { stream, lines } = capture();

    new Logger("seed", stream).error("multi\nline [message] with $pecial characters");

    expect(lines().join("\n").slice(9)).toBe("[seed] ERROR multi\nline [message] with $pecial characters");
  });

  test("masks known secrets in a message", () => {
    const { stream, lines } = capture();
    const password = new Secret("logger-password-1");

    new Logger("seed", stream).warn(`users: sign-in with ${password.reveal()} failed`);

    expect(lines()[0]?.slice(9)).toBe(`[seed] WARN users: sign-in with ${MASK} failed`);
  });
});
