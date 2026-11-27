import { inspect } from "node:util";

/** The text that replaces a secret value in string conversion, JSON serialization, console output and masked text. */
export const MASKED = "[SECRET]";

/** The minimum length of a secret value. A shorter value cannot be masked without also masking ordinary text. */
export const SECRET_MIN_LENGTH = 4;

/**
 * A type in which every string can also be a {@link Secret}. It describes plain JSON values that are revealed only when
 * sent, such as request bodies and GraphQL variables.
 */
export type SecretsAllowed<T> = T extends string
  ? T | Secret
  : T extends readonly (infer Item)[]
    ? readonly SecretsAllowed<Item>[]
    : T extends object
      ? { readonly [K in keyof T]: SecretsAllowed<T[K]> }
      : T;

const maskedValues = new Set<string>();
let maskPattern: RegExp | undefined;

/**
 * Represents a password, token or key whose value never appears in output. String conversion, JSON serialization and
 * console output produce {@link MASKED}.
 *
 * @remarks
 * Each value created by {@link Secret.of} is registered for {@link maskSecrets} for the lifetime of the process.
 *
 * @example
 * const password = Secret.of("Password1!");
 * `${password}`;                        // "[SECRET]"
 * JSON.stringify({ password });         // '{"password":"[SECRET]"}'
 * password.reveal();                    // "Password1!"
 * maskSecrets("password=Password1%21"); // "password=[SECRET]"
 */
export class Secret {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
    Object.freeze(this);
  }

  /**
   * Creates a secret and registers its value for {@link maskSecrets} in plain, URI-encoded, form-encoded and
   * JSON-escaped forms.
   *
   * @param value - The plain value.
   * @returns The secret that holds the value.
   * @throws {RangeError} The value is shorter than {@link SECRET_MIN_LENGTH}. The message does not contain the value.
   */
  static of(value: string): Secret {
    if (value.length < SECRET_MIN_LENGTH) {
      throw new RangeError(`A secret must have at least ${SECRET_MIN_LENGTH} characters`);
    }
    const registered = maskedValues.size;
    for (const encoded of encodingsOf(value)) {
      maskedValues.add(encoded);
    }
    if (maskedValues.size !== registered) {
      maskPattern = undefined;
    }
    return new Secret(value);
  }

  /**
   * Determines whether this secret and another secret hold the same value, without revealing either value.
   *
   * @param other - The secret to compare with.
   * @returns `true` if the values are equal; otherwise, `false`.
   */
  equals(other: Secret): boolean {
    return this.#value === other.#value;
  }

  /**
   * Returns a secret that holds a prefix followed by this value, such as the value of an `Authorization` header.
   *
   * @remarks
   * The new value is not registered for {@link maskSecrets}, because this value already is, and it is masked as a whole
   * token when the prefix ends with a character other than a letter or a digit, such as a space.
   *
   * @example
   * accessToken.withPrefix("Bearer "); // the secret "Bearer <token>"
   *
   * @param prefix - The text before the value, such as `Bearer `.
   * @returns The new secret.
   */
  withPrefix(prefix: string): Secret {
    return new Secret(prefix + this.#value);
  }

  /**
   * Returns the plain value.
   *
   * @remarks
   * Call this method only where the value is sent or stored. Keep the result out of messages, logs and assertions.
   */
  reveal(): string {
    return this.#value;
  }

  /** Returns {@link MASKED} instead of the value. */
  toString(): string {
    return MASKED;
  }

  /** Returns {@link MASKED} instead of the value. It is called during JSON serialization. */
  toJSON(): string {
    return MASKED;
  }

  /** Returns {@link MASKED} instead of the value. It is called when the secret is printed to the console. */
  [inspect.custom](): string {
    return MASKED;
  }
}

/**
 * Replaces each registered secret value in a text with {@link MASKED}.
 *
 * @remarks
 * A value is replaced only where it stands as a whole token: `admin` is masked in `password=admin`, but not in
 * `administrator`. Use this function for error messages and logs that can contain requests or responses.
 *
 * @param text - The text to mask.
 * @returns The text in which each registered secret value is replaced with {@link MASKED}.
 */
export function maskSecrets(text: string): string {
  if (maskedValues.size === 0) {
    return text;
  }
  maskPattern ??= buildMaskPattern();
  return text.replace(maskPattern, MASKED);
}

function buildMaskPattern(): RegExp {
  const alternatives = [...maskedValues]
    .sort((left: string, right: string) => right.length - left.length)
    .map(escapeRegExp)
    .join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, "gu");
}

function encodingsOf(value: string): string[] {
  return [
    value,
    encodeURIComponent(value),
    new URLSearchParams({ value }).toString().slice("value=".length),
    JSON.stringify(value).slice(1, -1),
  ];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns a copy of fields such as headers or form values with each {@link Secret} replaced by its value.
 *
 * @remarks
 * Call this function only where the values are sent. Keep the result out of messages, logs and assertions.
 *
 * @param fields - The fields to reveal.
 * @returns A copy of the fields in which each {@link Secret} is replaced by its value.
 */
export function revealedFields<V>(fields: Readonly<Record<string, V | Secret>>): Record<string, V | string> {
  return Object.fromEntries(
    Object.entries(fields).map(([name, value]: [string, V | Secret]) => [
      name,
      value instanceof Secret ? value.reveal() : value,
    ]),
  );
}

/**
 * Serializes a value to JSON with each {@link Secret}, at any depth, written as its value.
 *
 * @remarks
 * Call this function only where the JSON is sent. Keep the result out of messages, logs and assertions.
 *
 * @param value - The value to serialize.
 * @returns The JSON text.
 * @throws {TypeError} The value is `undefined`, a function or a symbol.
 */
export function revealedJson(value: unknown): string {
  const json = JSON.stringify(value, revealSecrets);
  if (json === undefined) {
    throw new TypeError("The value cannot be serialized to JSON");
  }
  return json;
}

function revealSecrets(this: unknown, key: string, value: unknown): unknown {
  const original = (this as Readonly<Record<string, unknown>>)[key];
  return original instanceof Secret ? original.reveal() : value;
}
