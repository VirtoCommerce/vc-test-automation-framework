import type { CollectionName } from "../manifest";

import { COLLECTION_NAMES, isCollectionName, MANIFEST } from "../manifest";

/** What one seed run covers. */
export interface SeedScope {
  /** `true` when `SEED_ONLY` limits the run to some collections; `false` for a full seed. */
  readonly partial: boolean;
  /** The collections to seed, in seed order. */
  readonly collections: readonly CollectionName[];
  /** The selected collections left out because their module is not installed, in seed order. */
  readonly skipped: readonly CollectionName[];
}

/**
 * Decides which collections a run seeds: all, or those in `SEED_ONLY`, minus those whose module is not installed.
 * Keeps the manifest's seed order whatever order `SEED_ONLY` uses.
 *
 * @param only - From {@link parseSeedOnly}; `undefined` for a full seed.
 */
export function resolveSeedScope(
  installedModuleIds: ReadonlySet<string>,
  only: readonly CollectionName[] | undefined,
): SeedScope {
  const selected = COLLECTION_NAMES.filter((name) => only === undefined || only.includes(name));
  return {
    partial: only !== undefined,
    collections: selected.filter((name) => installedModuleIds.has(MANIFEST[name].moduleId)),
    skipped: selected.filter((name) => !installedModuleIds.has(MANIFEST[name].moduleId)),
  };
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
