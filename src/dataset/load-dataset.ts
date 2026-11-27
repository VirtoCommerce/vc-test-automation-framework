import type { CollectionName, Manifest } from "./manifest.ts";
import type { PlaceholderValues } from "./placeholders.ts";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { errorMessage, maskSecrets } from "@/core";

import { Collection } from "./collection.ts";
import { collectionDirectory } from "./manifest.ts";
import { envSource, fillPlaceholders, jsonStringContent } from "./placeholders.ts";

/** A record without a known type: a JSON object. */
export type DatasetRecord = Readonly<Record<string, unknown>>;

/**
 * A loaded dataset: one {@link Collection} for each collection of a manifest.
 *
 * @remarks
 * `TRecords` gives the record type of collections by name, such as the types generated from the platform. Collections
 * that it does not name hold {@link DatasetRecord} values.
 */
export type Dataset<TManifest extends Manifest, TRecords extends object = object> = {
  readonly [Name in CollectionName<TManifest>]: Collection<
    Name extends keyof TRecords ? Extract<TRecords[Name], object> : DatasetRecord
  >;
};

/** The options of {@link loadDataset}. */
export interface LoadDatasetOptions<TManifest extends Manifest> {
  /** The collections to load. */
  readonly manifest: TManifest;
  /** The directory that holds one directory for each collection. */
  readonly dataDir: string;
  /** The values of the `${ENV:key}` placeholders in the data files. */
  readonly placeholders?: PlaceholderValues | undefined;
}

/**
 * Loads a dataset from JSON files.
 *
 * @remarks
 * Each collection reads the `.json` files in its directory and its subdirectories, in the order of their paths with `/`
 * as the separator, so the order is the same on every operating system. The `${ENV:key}`
 * placeholders in the files are filled in, and the records are frozen. A collection without a directory is empty. The
 * record types are not checked at run time.
 *
 * @param options - The manifest, the data directory and the placeholder values.
 * @returns The dataset.
 * @throws {Error} A file is not valid JSON, does not hold a JSON object, or has a placeholder without a value. The
 * message names the file and has secrets masked.
 */
export function loadDataset<TManifest extends Manifest, TRecords extends object = object>(
  options: LoadDatasetOptions<TManifest>,
): Dataset<TManifest, TRecords> {
  const values = options.placeholders ?? {};
  const collections: Record<string, Collection<object>> = {};
  for (const name of Object.keys(options.manifest)) {
    const dir = join(options.dataDir, collectionDirectory(name));
    collections[name] = new Collection(name, readRecords(dir, options.dataDir, values));
  }
  return collections as Dataset<TManifest, TRecords>;
}

function readRecords(dir: string, dataDir: string, values: PlaceholderValues): object[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => relative(dataDir, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort()
    .map((name) => readRecord(join(dataDir, name), name, values));
}

function readRecord(path: string, name: string, values: PlaceholderValues): object {
  try {
    const text = fillPlaceholders(readFileSync(path, "utf8"), { ENV: envSource(values) }, jsonStringContent);
    const record: unknown = JSON.parse(text);
    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      throw new Error("the file does not hold a JSON object");
    }
    return deepFreeze(record);
  } catch (error) {
    throw new Error(maskSecrets(`The dataset file ${name}: ${errorMessage(error)}`));
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
    Object.freeze(value);
  }
  return value;
}
