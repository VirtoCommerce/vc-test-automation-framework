import type { InstalledModules } from "@core/modules";
import type { CollectionName } from "../manifest";

import { unmetReason } from "@core/modules";

import { COLLECTION_NAMES, isCollectionName, MANIFEST } from "../manifest";

/** A collection left out of a seed run, and why. */
export interface SkippedCollection {
  readonly name: CollectionName;
  /** Why its module does not qualify, such as `VirtoCommerce.XPickup is not installed`. */
  readonly reason: string;
}

/** What one seed run covers. */
export interface SeedScope {
  /** `true` when `SEED_ONLY` limits the run to some collections; `false` for a full seed. */
  readonly partial: boolean;
  /** The collections to seed, in seed order. */
  readonly collections: readonly CollectionName[];
  /** The selected collections whose module is missing or outside its version range, in seed order. */
  readonly skipped: readonly SkippedCollection[];
}

/**
 * Decides which collections a run seeds: all, or those in `SEED_ONLY`, minus those whose module is not installed
 * or not in the collection's version range. Keeps the manifest's seed order whatever order `SEED_ONLY` uses.
 *
 * @param only - From {@link parseSeedOnly}; `undefined` for a full seed.
 */
export function resolveSeedScope(installed: InstalledModules, only: readonly CollectionName[] | undefined): SeedScope {
  const selected = COLLECTION_NAMES.filter((name) => only === undefined || only.includes(name));
  const collections: CollectionName[] = [];
  const skipped: SkippedCollection[] = [];
  for (const name of selected) {
    const reason = unmetReason(MANIFEST[name].module, installed);
    if (reason === undefined) {
      collections.push(name);
    } else {
      skipped.push({ name, reason });
    }
  }
  return { partial: only !== undefined, collections, skipped };
}

/**
 * Parses `SEED_ONLY`, comma-separated collection names such as `products, prices`; unset means a full seed.
 *
 * @returns The listed collections, or `undefined` for a full seed.
 * @throws Error naming every unknown name and listing the known ones, or when no name is given.
 */
export function parseSeedOnly(value: string | undefined): readonly CollectionName[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const names = value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  if (names.length === 0) {
    throw new Error(`SEED_ONLY lists no collection; known collections: ${COLLECTION_NAMES.join(", ")}`);
  }
  const unknown = names.filter((name) => !isCollectionName(name));
  if (unknown.length > 0) {
    throw new Error(
      `SEED_ONLY lists unknown collections: ${unknown.join(", ")}; known: ${COLLECTION_NAMES.join(", ")}`,
    );
  }
  return names.filter(isCollectionName);
}
