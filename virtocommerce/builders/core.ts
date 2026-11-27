import { uniqueId } from "../support/unique-id.ts";

/** A dictionary of the core module, such as the currencies, and how its entries are keyed. */
export interface Dictionary {
  /** The path of the dictionary, which lists, creates and updates its entries. */
  readonly path: string;
  /** The field that keys an entry, such as `code`. */
  readonly keyField: string;
  /** The query parameter that names the entries to delete, such as `codes`. */
  readonly deleteQuery: string;
}

/** An entry of a {@link Dictionary}, with its key. */
export interface DictionaryEntry {
  readonly key: string;
  readonly entry: { readonly name: string } & Readonly<Record<string, string>>;
}

/** The currencies of the platform, keyed by code. */
export const CURRENCIES: Dictionary = { path: "/api/currencies", keyField: "code", deleteQuery: "codes" };

/** The package types of the platform, keyed by id. */
export const PACKAGE_TYPES: Dictionary = { path: "/api/packageTypes", keyField: "id", deleteQuery: "ids" };

/**
 * Returns a new currency with a unique code.
 *
 * @returns The currency, keyed by its code.
 */
export function newCurrency(): DictionaryEntry {
  const code = uniqueId("QA");
  return { key: code, entry: { code, name: `Test currency ${code}` } };
}

/**
 * Returns a new package type with a unique id.
 *
 * @returns The package type, keyed by its id.
 */
export function newPackageType(): DictionaryEntry {
  const id = uniqueId("test-package-type");
  return { key: id, entry: { id, name: id } };
}
