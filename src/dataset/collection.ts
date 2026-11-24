/**
 * Represents the records of one dataset collection, with lookups by identifier.
 *
 * @remarks
 * The records are frozen. Copy a record to build a request body instead of changing it.
 *
 * @example
 * const laptop = dataset.products.get("product-laptop-acer-swift-go-14");
 */
export class Collection<T extends object> {
  /** The name of the collection in the manifest. */
  readonly name: string;
  readonly #records: readonly T[];
  #byId: ReadonlyMap<string, T> | undefined;

  /**
   * Creates a collection.
   *
   * @param name - The name of the collection.
   * @param records - The records, in the order of their files.
   */
  constructor(name: string, records: readonly T[]) {
    this.name = name;
    this.#records = Object.freeze([...records]);
  }

  /** Gets the number of records. */
  get count(): number {
    return this.#records.length;
  }

  /**
   * Returns every record.
   *
   * @returns The records, in the order of their files.
   */
  all(): readonly T[] {
    return this.#records;
  }

  /**
   * Returns the record with an identifier.
   *
   * @param id - The `id` of the record.
   * @returns The record.
   * @throws {Error} No record has the identifier, or two records share an identifier.
   */
  get(id: string): T {
    this.#byId ??= indexById(this.name, this.#records);
    const record = this.#byId.get(id);
    if (record === undefined) {
      throw new Error(`The dataset collection ${this.name} has no record "${id}"`);
    }
    return record;
  }

  /**
   * Returns the records that match a condition.
   *
   * @param predicate - The condition.
   * @returns The matching records, in the order of their files.
   */
  filter(predicate: (record: T) => boolean): T[] {
    return this.#records.filter(predicate);
  }
}

function indexById<T extends object>(name: string, records: readonly T[]): ReadonlyMap<string, T> {
  const byId = new Map<string, T>();
  for (const record of records) {
    const id: unknown = Reflect.get(record, "id");
    if (typeof id !== "string") {
      continue;
    }
    if (byId.has(id)) {
      throw new Error(`The dataset collection ${name} has more than one record "${id}"`);
    }
    byId.set(id, record);
  }
  return byId;
}
