import type { Secret } from "./secret";

/**
 * `T` with every property `readonly`, recursively; the compile-time counterpart of {@link deepFreeze}.
 * Functions and {@link Secret} are left as is, so a `Secret` stays assignable to its class.
 */
export type DeepReadonly<T> = T extends ((...args: never[]) => unknown) | Secret
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/**
 * Freezes a value in place, recursively through own enumerable string-keyed properties, and returns it.
 * Cycles are safe; primitives and functions pass through; `Map`/`Set` contents stay mutable.
 *
 * @example
 * const config = deepFreeze({ admin: { username: "admin" } });
 * config.admin.username = "other"; // compile error; TypeError at run time in strict mode
 *
 * @param seen - Internal, for the recursion; do not pass.
 */
export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): DeepReadonly<T> {
  if (value !== null && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child, seen);
    }
  }
  return value as DeepReadonly<T>;
}
