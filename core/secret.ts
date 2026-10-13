import { inspect } from "node:util";

import { jsonStringContent } from "./interpolate";

/** The text printed in place of a secret value. */
export const MASK = "[SECRET]";

const MIN_MASKED_LENGTH = 4;

/**
 * A password, API key or token that prints as {@link MASK} (string conversion, JSON, `console.log`).
 * Call {@link Secret#reveal} only where the value is sent. Values of 4+ characters are remembered for the
 * worker's lifetime so {@link Secret.mask} can hide them in any text. Secrets in platform responses are not wrapped.
 *
 * @example
 * const password = new Secret("Password1!");
 * `${password}`;                     // "[SECRET]"
 * form.password = password.reveal(); // "Password1!"
 * Secret.mask("password=Password1%21"); // "password=[SECRET]"
 */
export class Secret {
  static readonly #known = new Set<string>();
  readonly #value: string;

  /**
   * Wraps a value and remembers it for {@link Secret.mask} as given, form-encoded, URL-encoded and JSON-escaped.
   * Values shorter than four characters (such as an empty API key) are not remembered, so they never mask plain text.
   */
  constructor(value: string) {
    this.#value = value;
    if (value.length >= MIN_MASKED_LENGTH) {
      for (const form of encodedForms(value)) {
        Secret.#known.add(form);
      }
    }
  }

  /**
   * Replaces every remembered secret value in a text with {@link MASK}, longest first.
   * Use on error messages and logs that may echo requests or responses.
   */
  static mask(text: string): string {
    let masked = text;
    for (const form of [...Secret.#known].sort((a, b) => b.length - a.length)) {
      masked = masked.replaceAll(form, MASK);
    }
    return masked;
  }

  /** Returns the plain value, for a form, header or body; keep it out of messages, logs and assertions. */
  reveal(): string {
    return this.#value;
  }

  /** Compares two secrets by value without revealing either. */
  equals(other: Secret): boolean {
    return this.#value === other.#value;
  }

  /** Returns {@link MASK}. */
  toString(): string {
    return MASK;
  }

  /** Returns {@link MASK}. */
  toJSON(): string {
    return MASK;
  }

  /** Returns {@link MASK}. */
  [inspect.custom](): string {
    return MASK;
  }
}

function encodedForms(value: string): string[] {
  const formEncoded = new URLSearchParams({ v: value }).toString().slice("v=".length);
  return [value, formEncoded, encodeURIComponent(value), jsonStringContent(value)];
}
