import { uniqueId } from "@core/unique-id";

/** A dictionary entry to create, with the key it is found and deleted by. */
export interface DictionaryEntry {
  readonly key: string;
  readonly entry: { readonly name: string };
}

/** A platform dictionary keyed by one value per entry, such as currencies by code or package types by id. */
export interface Dictionary {
  find(key: string): Promise<{ readonly name: string } | undefined>;
  create(entry: object): Promise<void>;
  update(entry: object): Promise<void>;
  delete(keys: readonly string[]): Promise<void>;
}

/** Builds a currency keyed by its unique `QA-…` code. */
export function newCurrency(): DictionaryEntry {
  const code = uniqueId("QA");
  const entry = { code, name: `Test currency ${code}` };
  return { key: code, entry };
}

/** Builds a package type keyed by its unique `test-package-type-…` id, which is also its name. */
export function newPackageType(): DictionaryEntry {
  const id = uniqueId("test-package-type");
  const entry = { id, name: id };
  return { key: id, entry };
}
