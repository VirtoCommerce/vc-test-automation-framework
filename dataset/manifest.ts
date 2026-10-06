import type { output } from "zod";

import { boolean, enum as enumOf, strictObject, string } from "zod";

import { HTTP_METHOD } from "@api/http/http-method";
import { deepFreeze } from "@core/deep-freeze";
import { nonEmptyString, parseOrThrow } from "@core/validation";

import manifestJson from "./data/manifest.json";

const PAYLOAD_TYPE = ["single", "array"] as const;

const ManifestEntrySchema = strictObject({
  dir: nonEmptyString,
  moduleId: nonEmptyString,
  method: enumOf(HTTP_METHOD),
  endpoint: string().startsWith("/"),
  payloadType: enumOf(PAYLOAD_TYPE),
  parentRefField: string().optional(),
  optional: boolean().optional(),
});

export type ManifestEntry = output<typeof ManifestEntrySchema>;
export type ManifestItemName = keyof typeof manifestJson;

export interface ManifestItem extends ManifestEntry {
  readonly name: ManifestItemName;
}

export const MANIFEST_ITEMS: readonly ManifestItem[] = deepFreeze(parseManifest(manifestJson));

function parseManifest(json: Readonly<Record<ManifestItemName, unknown>>): ManifestItem[] {
  return Object.entries(json).map(([name, entry]) => {
    const parsed = parseOrThrow(ManifestEntrySchema, entry, `Invalid dataset manifest item "${name}"`);
    return { name: name as ManifestItemName, ...parsed };
  });
}
