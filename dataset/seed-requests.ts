import type { DatasetItem } from "./dataset";
import type { ManifestEntry } from "./manifest";

import { interpolate } from "@core/interpolate";
import { topologicalSort } from "@core/topological-sort";

import { fromEnv } from "./dataset";

export interface SeedRequest {
  readonly label: string;
  readonly path: string;
  readonly body: unknown;
}

export function seedRequests(entry: ManifestEntry, items: readonly DatasetItem[]): SeedRequest[] {
  if (entry.payloadType === "array") {
    return [{ label: `${items.length} items`, path: resolveEndpoint(entry.endpoint), body: items }];
  }
  const { parentRefField } = entry;
  const ordered = parentRefField === undefined ? items : topologicalSort(items, idOf, (item) => item[parentRefField]);
  return ordered.map((item) => ({
    label: `item "${String(item["id"] ?? item["name"] ?? "?")}"`,
    path: resolveEndpoint(entry.endpoint, item),
    body: item,
  }));
}

function resolveEndpoint(endpoint: string, item?: DatasetItem): string {
  return interpolate(endpoint, { ENV: fromEnv, PAYLOAD_ITEM: (key) => item?.[key] }, encodeURIComponent);
}

function idOf({ id }: DatasetItem): unknown {
  return id;
}
