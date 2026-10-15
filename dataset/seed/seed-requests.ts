import type { CollectionSpec } from "../manifest";
import type { EnvPlaceholders } from "../placeholders";

import { interpolate } from "@core/interpolate";
import { topologicalSort } from "@core/topological-sort";

/** One request of a seed run. */
export interface SeedRequest {
  /** Names what is sent, for logs and error messages, such as `record "product-laptop"` or `11 records`. */
  readonly label: string;
  /** The path the request is sent to, with its placeholders filled in. */
  readonly path: string;
  /** The path that finds an existing record first, for collections that must not be sent twice. */
  readonly findPath: string | undefined;
  /** The path whose `ETag` is sent as `If-Match`, for endpoints that require the current version. */
  readonly ifMatchPath: string | undefined;
  /** The request body: one record, or all of them. */
  readonly body: unknown;
}

/**
 * Turns a collection's records into seed requests, in the order they must be sent.
 *
 * - `send: "all"`: one request with every record; none for an empty collection, since an empty list would
 *   wipe what the platform holds.
 * - `send: "each"`: one request per record; with a `parentField`, parents come before their children.
 *
 * Paths fill `${ENV:key}` from `env` and `${RECORD:field}` from the record, URL-encoding every value.
 *
 * @throws Error when a path placeholder cannot be filled in, or when parent references form a cycle.
 */
export function seedRequests(spec: CollectionSpec, records: readonly object[], env: EnvPlaceholders): SeedRequest[] {
  if (spec.send === "all") {
    if (records.length === 0) {
      return [];
    }
    return [
      {
        label: `${records.length} records`,
        path: interpolate(spec.endpoint, { ENV: (key) => env[key] }, encodeURIComponent),
        findPath: undefined,
        ifMatchPath: undefined,
        body: records,
      },
    ];
  }
  return inSeedOrder(spec, records).map((record, index) => ({
    label: labelOf(spec, record, index),
    path: resolvePath(spec.endpoint, env, record),
    findPath: spec.find === undefined ? undefined : resolvePath(spec.find, env, record),
    ifMatchPath: spec.ifMatchFrom === undefined ? undefined : resolvePath(spec.ifMatchFrom, env, record),
    body: record,
  }));
}

function inSeedOrder({ parentField }: CollectionSpec, records: readonly object[]): readonly object[] {
  if (parentField === undefined) {
    return records;
  }
  return topologicalSort(
    records,
    (record) => fieldOf(record, "id"),
    (record) => fieldOf(record, parentField),
  );
}

/**
 * The find path of one record, with its placeholders filled in; `undefined` when the collection has no `find`.
 * The seeder uses it to leave stored records out of a `send: "all"` request.
 */
export function findPathOf(spec: CollectionSpec, record: object, env: EnvPlaceholders): string | undefined {
  return spec.find === undefined ? undefined : resolvePath(spec.find, env, record);
}

function resolvePath(template: string, env: EnvPlaceholders, record: object): string {
  return interpolate(template, { ENV: (key) => env[key], RECORD: (key) => fieldOf(record, key) }, encodeURIComponent);
}

/** Names one record for logs and error messages: by id, by its first key, or by its position. */
export function labelOf({ keys }: CollectionSpec, record: object, index: number): string {
  const id = fieldOf(record, "id");
  if (typeof id === "string") {
    return `record "${id}"`;
  }
  const key = keys?.[0];
  if (key !== undefined) {
    const fields = typeof key === "string" ? [key] : key;
    return `record "${fields.map((field) => String(fieldOf(record, field))).join(" + ")}"`;
  }
  return `record #${index + 1}`;
}

function fieldOf(record: object, field: string): unknown {
  return Reflect.get(record, field);
}
