import type { InstalledModules } from "@/modules";
import type { CollectionName, CollectionSpec, Manifest } from "./manifest.ts";

import { errorMessage } from "@/core";

/** A collection that a seed run leaves out, and the reason. */
export interface SkippedCollection<TManifest extends Manifest> {
  /** The name of the collection. */
  readonly name: CollectionName<TManifest>;
  /** Why the collection is left out, such as `VirtoCommerce.XPickup is not installed` or `no records`. */
  readonly reason: string;
}

/** The collections that a seed run covers. */
export interface SeedScope<TManifest extends Manifest> {
  /** The collections to seed, each with its manifest entry, in seed order. */
  readonly collections: readonly (readonly [CollectionName<TManifest>, CollectionSpec])[];
  /** The selected collections whose module does not qualify or that have no records, in seed order. */
  readonly skipped: readonly SkippedCollection<TManifest>[];
}

/**
 * Decides which collections a seed run covers: every collection, or the selected ones, except those whose module is
 * not installed or not in its range of versions, and those without records.
 *
 * @param manifest - The collections, in seed order.
 * @param installed - The modules installed on the platform.
 * @param recordCount - Returns the number of records of a collection.
 * @param only - The selected collections, or `undefined` for every collection. Their order does not matter.
 * @returns The scope, in the seed order of the manifest.
 * @throws {Error} The installed version of a module cannot be compared with its range. The message starts with the
 * collection, and the cause is the original error.
 */
export function resolveSeedScope<TManifest extends Manifest>(
  manifest: TManifest,
  installed: InstalledModules,
  recordCount: (name: CollectionName<TManifest>) => number,
  only?: readonly CollectionName<TManifest>[] | undefined,
): SeedScope<TManifest> {
  const collections: (readonly [CollectionName<TManifest>, CollectionSpec])[] = [];
  const skipped: SkippedCollection<TManifest>[] = [];
  for (const [key, spec] of Object.entries(manifest)) {
    const name = key as CollectionName<TManifest>;
    if (only !== undefined && !only.includes(name)) {
      continue;
    }
    const reason = unmetReason(name, spec, installed) ?? (recordCount(name) === 0 ? "no records" : undefined);
    if (reason === undefined) {
      collections.push([name, spec]);
    } else {
      skipped.push({ name, reason });
    }
  }
  return { collections, skipped };
}

function unmetReason(name: string, spec: CollectionSpec, installed: InstalledModules): string | undefined {
  try {
    return installed.unmetReason(spec.module);
  } catch (error) {
    throw new Error(`${name}: ${errorMessage(error)}`, { cause: error });
  }
}

/**
 * Parses a comma-separated list of collection names, such as `products, prices`, for example from an environment
 * variable.
 *
 * @param manifest - The known collections.
 * @param value - The list, or `undefined` for every collection.
 * @returns The listed collections, or `undefined` for every collection.
 * @throws {Error} The list is empty or names an unknown collection. The message lists the known collections.
 */
export function parseCollectionNames<TManifest extends Manifest>(
  manifest: TManifest,
  value: string | undefined,
): readonly CollectionName<TManifest>[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const known = Object.keys(manifest);
  const names = value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  if (names.length === 0) {
    throw new Error(`The list names no collection; the known collections are ${known.join(", ")}`);
  }
  const unknown = names.filter((name) => !known.includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `The list names unknown collections: ${unknown.join(", ")}; the known collections are ${known.join(", ")}`,
    );
  }
  return names as CollectionName<TManifest>[];
}
