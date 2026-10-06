import type { ManifestItem, ManifestItemName } from "./manifest";

import { MANIFEST_ITEMS } from "./manifest";

export interface SeedScope {
  readonly entities: readonly ManifestItem[];
  readonly skipped: readonly ManifestItem[];
}

const KNOWN_NAMES: readonly string[] = MANIFEST_ITEMS.map((item) => item.name);

export function resolveSeedScope(
  installedModuleIds: ReadonlySet<string>,
  only: readonly ManifestItemName[] | undefined,
): SeedScope {
  const selected = only === undefined ? MANIFEST_ITEMS : MANIFEST_ITEMS.filter((item) => only.includes(item.name));
  return {
    entities: selected.filter((entity) => installedModuleIds.has(entity.moduleId)),
    skipped: selected.filter((entity) => !installedModuleIds.has(entity.moduleId)),
  };
}

export function parseSeedOnly(value: string | undefined): readonly ManifestItemName[] | undefined {
  const names = (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  if (names.length === 0) {
    return undefined;
  }
  const unknownNames = names.filter((name) => !isManifestItemName(name));
  if (unknownNames.length > 0) {
    throw new Error(`Unknown entities: ${unknownNames.join(", ")}. Known entities: ${KNOWN_NAMES.join(", ")}`);
  }
  return names.filter(isManifestItemName);
}

function isManifestItemName(name: string): name is ManifestItemName {
  return KNOWN_NAMES.includes(name);
}
