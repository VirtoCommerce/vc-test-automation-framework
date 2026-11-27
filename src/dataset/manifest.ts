import type { UrlPath } from "@/core";
import type { HttpMethod } from "@/http";
import type { ModuleRequirement } from "@/modules";

/**
 * A search that finds the stored copy of a record whose identifier the platform assigns, matched by one field.
 *
 * @remarks
 * The paths and the strings of the criteria can contain `${ENV:key}` and `${RECORD:field}` placeholders.
 */
export interface StoredIdLookup {
  /** The path of the search, such as `/api/shipping/search`. */
  readonly searchPath: UrlPath;
  /** The criteria of the search. */
  readonly criteria: Readonly<Record<string, unknown>>;
  /**
   * The field that a stored record shares with the dataset record, such as `code`. When several stored records match,
   * the first one is used.
   */
  readonly match: string;
}

/**
 * Describes how the records of one collection are sent to the platform.
 *
 * @remarks
 * Paths can contain `${ENV:key}` placeholders, filled from the placeholder values of the seed run. `findPath`,
 * `storedIdFrom` and, for collections sent one record at a time, `path` and `ifMatchPath` can also contain
 * `${RECORD:field}` placeholders, filled from the record. Every value is URL-encoded.
 */
export interface CollectionSpec {
  /** The module, with its range of versions, that the collection needs. Without it, the collection is skipped. */
  readonly module: ModuleRequirement;
  /** The method of the seed request. */
  readonly method: HttpMethod;
  /** The path of the seed request, such as `/api/catalog/catalogs`. */
  readonly path: UrlPath;
  /** Whether to send one request for each record (`each`) or one request with every record (`all`). */
  readonly send: "each" | "all";
  /** The field, or the fields, that name a record without an identifier in logs and errors. */
  readonly key?: string | readonly string[] | undefined;
  /**
   * The path that finds a stored record. A record that the platform already stores is left as it is, so changes to it
   * in the dataset are not sent. A 404 status, an empty body, `null` and an empty array mean that the record is not
   * stored. Without it, every record is sent again, and the seed request replaces the stored one.
   */
  readonly findPath?: UrlPath | undefined;
  /**
   * The path whose `ETag` the seed request sends as `If-Match`, for endpoints that refuse a write without the current
   * version. It is read right before each request. When the path is not found (404) or its response has no `ETag`,
   * none is sent.
   */
  readonly ifMatchPath?: UrlPath | undefined;
  /**
   * A search that finds the stored copy of a record whose identifier the platform assigns, so the record is sent with
   * that identifier and replaces the stored copy instead of adding another.
   */
  readonly storedIdFrom?: StoredIdLookup | undefined;
  /**
   * The field that references a parent record in the same collection, for collections sent one record at a time.
   * Parents are sent before their children.
   */
  readonly parentField?: string | undefined;
}

/**
 * The collections of a dataset in seed order, and how each one is sent. The records of a collection are the JSON files
 * in its directory, which is named after the collection in kebab case, such as `product-inventories` for
 * `productInventories`.
 */
export type Manifest = Readonly<Record<string, CollectionSpec>>;

/** The name of a collection of a manifest. */
export type CollectionName<TManifest extends Manifest> = Extract<keyof TManifest, string>;

/**
 * Returns the directory of a collection: its name in kebab case.
 *
 * @param name - The name of the collection, such as `productInventories`.
 * @returns The directory, such as `product-inventories`.
 */
export function collectionDirectory(name: string): string {
  return name.replace(/[A-Z]/g, (letter: string) => `-${letter.toLowerCase()}`);
}
