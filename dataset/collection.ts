import type { CollectionName } from "./manifest";

/**
 * The records of one dataset collection, with lookups by id.
 * Records are frozen: copy one to build a request body, never change it. Duplicate ids are reported on first lookup.
 *
 * @example
 * dataset.products.get(productId);
 */
export class Collection<T extends object> {
  /** The collection's name in the manifest. */
  readonly name: CollectionName;
  readonly #records: readonly T[];
  #byId: ReadonlyMap<string, T> | undefined;

  /** @param records - In file order. */
  constructor(name: CollectionName, records: readonly T[]) {
    this.name = name;
    this.#records = records;
  }

  /** How many records the collection has. */
  get size(): number {
    return this.#records.length;
  }

  /** Returns every record, in file order. */
  all(): readonly T[] {
    return this.#records;
  }

  /**
   * Returns the record with an id.
   *
   * @throws Error naming the collection and id when no record has it, or when two records share an id.
   */
  get(id: string): T {
    this.#byId ??= indexById(this.name, this.#records);
    const record = this.#byId.get(id);
    if (record === undefined) {
      throw new Error(`Dataset ${this.name} has no record "${id}"`);
    }
    return record;
  }

  /** Returns the records that match, in file order. */
  filter(predicate: (record: T) => boolean): T[] {
    return this.#records.filter(predicate);
  }
}

function indexById<T extends object>(name: CollectionName, records: readonly T[]): ReadonlyMap<string, T> {
  const byId = new Map<string, T>();
  for (const record of records) {
    const id = (record as { readonly id?: unknown }).id;
    if (typeof id !== "string") {
      continue;
    }
    if (byId.has(id)) {
      throw new Error(`Dataset ${name} has more than one record "${id}"`);
    }
    byId.set(id, record);
  }
  return byId;
}
