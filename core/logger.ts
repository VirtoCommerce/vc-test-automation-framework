import type { Writable } from "node:stream";

import { styleText } from "node:util";

import { Secret } from "./secret";

type Level = "info" | "success" | "warn" | "error";

const COLORS: Readonly<Record<Level, Parameters<typeof styleText>[0]>> = {
  info: "gray",
  success: "green",
  warn: "yellow",
  error: "red",
};

/**
 * Console logger for setup steps such as seeding.
 * Lines look like `14:03:27 [seed] SUCCESS products: 179 of 179 in 12.3s`: UTC time, scope, level coloured
 * when the stream supports it. All levels share one stream to keep their order; known secrets are masked.
 *
 * @example
 * const logger = new Logger("seed");
 * logger.warn("pickupLocations: module VirtoCommerce.XPickup is not installed, skipped");
 */
export class Logger {
  readonly #scope: string;
  readonly #stream: Writable;

  /**
   * @param scope - Short name shown in brackets on every line.
   * @param stream - Default stdout; pass another stream to capture lines in unit tests.
   */
  constructor(scope: string, stream: Writable = process.stdout) {
    this.#scope = scope;
    this.#stream = stream;
  }

  /** Logs routine progress. */
  info(message: string): void {
    this.#write("info", message);
  }

  /** Logs a finished step. */
  success(message: string): void {
    this.#write("success", message);
  }

  /** Logs something skipped or suspicious that does not stop the run. */
  warn(message: string): void {
    this.#write("warn", message);
  }

  /** Logs a failure; it does not throw. */
  error(message: string): void {
    this.#write("error", message);
  }

  #write(level: Level, message: string): void {
    const time = new Date().toISOString().slice(11, 19);
    const label = styleText(COLORS[level], level.toUpperCase(), { stream: this.#stream });
    this.#stream.write(`${time} [${this.#scope}] ${label} ${Secret.mask(message)}\n`);
  }
}
