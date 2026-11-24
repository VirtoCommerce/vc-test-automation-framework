import type { CollectionSpec } from "./manifest.ts";
import type { PlaceholderSources, PlaceholderValues } from "./placeholders.ts";

import { envSource, fillPlaceholders, hasPlaceholder, jsonStringContent } from "./placeholders.ts";

/** A dataset record with the label that names it in logs and errors. */
export interface LabeledRecord {
  /** The record. */
  readonly record: object;
  /** The label, such as `record "catalog-b2b"` or `record #3`. */
  readonly label: string;
}

/** A seed request with its placeholders filled in. */
export interface SeedRequest {
  /** The path of the request. */
  readonly path: string;
  /** The path whose `ETag` is sent as `If-Match`, or `undefined` when none is sent. */
  readonly ifMatchPath: string | undefined;
  /** The body: a record, or the records of a collection sent in one request. */
  readonly body: unknown;
}

/** A search for the stored copy of a record, with its placeholders filled in. */
export interface StoredIdSearch {
  /** The path of the search. */
  readonly path: string;
  /** The criteria of the search. */
  readonly criteria: unknown;
  /** The field that a stored record shares with the dataset record. */
  readonly match: string;
}

/**
 * Fills the placeholders of a path, URL-encoded: `${ENV:key}` placeholders from the placeholder values of the run and,
 * when a record is given, `${RECORD:field}` placeholders from the record.
 *
 * @param template - The path with placeholders.
 * @param record - The record, or `undefined` for a path without record placeholders.
 * @returns The path with every placeholder filled in.
 * @throws {Error} A placeholder has no value.
 */
export type PathResolver = (template: string, record?: object) => string;

/**
 * Returns the {@link PathResolver} of a seed run.
 *
 * @param values - The values of the `${ENV:key}` placeholders.
 * @returns The resolver.
 */
export function pathResolver(values: PlaceholderValues): PathResolver {
  return function resolve(template: string, record?: object): string {
    return fillPlaceholders(template, sourcesOf(values, record), encodeURIComponent);
  };
}

/**
 * Ensures that a manifest entry can be seeded: a collection sent in one request has no `parentField` and no
 * `${RECORD:field}` placeholders in its `path` and `ifMatchPath`.
 *
 * @param name - The name of the collection.
 * @param spec - The manifest entry of the collection.
 * @throws {Error} The entry cannot be seeded. The message names the collection.
 */
export function checkSpec(name: string, spec: CollectionSpec): void {
  if (spec.send !== "all") {
    return;
  }
  if (spec.parentField !== undefined) {
    throw new Error(`The collection ${name} is sent in one request, so it cannot have a parentField`);
  }
  for (const path of [spec.path, spec.ifMatchPath]) {
    if (path !== undefined && hasPlaceholder(path, "RECORD")) {
      throw new Error(`The collection ${name} is sent in one request, so ${path} cannot have record placeholders`);
    }
  }
}

/**
 * Labels the records of a collection in file order: by `id`, by the `key` of the collection when the record has every
 * key field, or by position.
 *
 * @param spec - The manifest entry of the collection.
 * @param records - The records, in file order.
 * @returns The labeled records, in the same order.
 */
export function labeled(spec: CollectionSpec, records: readonly object[]): LabeledRecord[] {
  return records.map((record, index) => ({ record, label: labelOf(spec, record, index) }));
}

/**
 * Returns a seed request.
 *
 * @param spec - The manifest entry of the collection.
 * @param resolve - The path resolver of the run.
 * @param body - The body: one record, or the records of a collection sent in one request.
 * @param record - The record whose fields fill the `${RECORD:field}` placeholders, or `undefined` for a collection sent
 * in one request.
 * @returns The request.
 * @throws {Error} A placeholder has no value.
 */
export function requestOf(spec: CollectionSpec, resolve: PathResolver, body: unknown, record?: object): SeedRequest {
  return {
    path: resolve(spec.path, record),
    ifMatchPath: spec.ifMatchPath === undefined ? undefined : resolve(spec.ifMatchPath, record),
    body,
  };
}

/**
 * Returns the search for the stored copy of a record whose identifier the platform assigns.
 *
 * @param spec - The manifest entry of the collection.
 * @param record - The record.
 * @param values - The values of the `${ENV:key}` placeholders.
 * @returns The search with its placeholders filled in, or `undefined` when the collection has no `storedIdFrom`.
 * @throws {Error} A placeholder has no value.
 */
export function storedIdSearchOf(
  spec: CollectionSpec,
  record: object,
  values: PlaceholderValues,
): StoredIdSearch | undefined {
  const lookup = spec.storedIdFrom;
  if (lookup === undefined) {
    return undefined;
  }
  const sources = sourcesOf(values, record);
  return {
    path: fillPlaceholders(lookup.searchPath, sources, encodeURIComponent),
    criteria: JSON.parse(fillPlaceholders(JSON.stringify(lookup.criteria), sources, jsonStringContent)),
    match: lookup.match,
  };
}

/**
 * Returns a field of a record.
 *
 * @param record - The record.
 * @param field - The name of the field.
 * @returns The value of the field, or `undefined` when the record has no such field.
 */
export function fieldOf(record: object, field: string): unknown {
  return Reflect.get(record, field);
}

/**
 * Orders records so that each parent comes before its children. Records keep their order otherwise, and a parent that
 * is not among the records does not hold back its children.
 *
 * @param records - The labeled records, in file order.
 * @param parentField - The field that holds the `id` of the parent.
 * @returns The records in seed order.
 * @throws {Error} Records reference each other as parents. The message lists the identifiers of the cycle.
 */
export function parentsFirst(records: readonly LabeledRecord[], parentField: string): LabeledRecord[] {
  const byId = new Map<string, LabeledRecord>();
  for (const entry of records) {
    const id = fieldOf(entry.record, "id");
    if (typeof id === "string") {
      byId.set(id, entry);
    }
  }
  const sorted: LabeledRecord[] = [];
  const visiting = new Set<LabeledRecord>();
  const done = new Set<LabeledRecord>();
  function visit(entry: LabeledRecord, chain: readonly string[]): void {
    if (done.has(entry)) {
      return;
    }
    const id = String(fieldOf(entry.record, "id"));
    if (visiting.has(entry)) {
      throw new Error(`The records reference each other as parents: ${[...chain, id].join(" → ")}`);
    }
    visiting.add(entry);
    const parentId = fieldOf(entry.record, parentField);
    const parent = typeof parentId === "string" ? byId.get(parentId) : undefined;
    if (parent !== undefined) {
      visit(parent, [...chain, id]);
    }
    visiting.delete(entry);
    done.add(entry);
    sorted.push(entry);
  }
  for (const entry of records) {
    visit(entry, []);
  }
  return sorted;
}

function labelOf({ key }: CollectionSpec, record: object, index: number): string {
  const id = fieldOf(record, "id");
  if (typeof id === "string") {
    return `record "${id}"`;
  }
  const values = (typeof key === "string" ? [key] : (key ?? [])).map((field) => fieldOf(record, field));
  if (values.length > 0 && values.every((value) => value !== undefined && value !== null)) {
    return `record "${values.map(String).join(" + ")}"`;
  }
  return `record #${index + 1}`;
}

function sourcesOf(values: PlaceholderValues, record: object | undefined): PlaceholderSources {
  const env = envSource(values);
  if (record === undefined) {
    return { ENV: env };
  }
  return {
    ENV: env,
    RECORD: function recordField(field: string): unknown {
      return fieldOf(record, field);
    },
  };
}
