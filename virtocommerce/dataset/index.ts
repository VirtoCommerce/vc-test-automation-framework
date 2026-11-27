import type { PlaceholderValues } from "@virtocommerce/test-automation-framework/dataset";
import type { DatasetRecords } from "./records.ts";

import { fileURLToPath } from "node:url";

import { loadDataset } from "@virtocommerce/test-automation-framework/dataset";

import { env } from "../env.ts";
import { MANIFEST } from "./manifest.ts";

/** The values of the `${ENV:key}` placeholders in the data files and in the manifest. */
export const PLACEHOLDERS: PlaceholderValues = {
  FRONTEND_BASE_URL: env.FRONTEND_BASE_URL,
  USERS_PASSWORD: env.USERS_PASSWORD,
  GOOGLE_MAPS_API_KEY: env.GOOGLE_MAPS_API_KEY ?? "",
};

/** The Virto Commerce dataset, loaded from `dataset/data`. */
export const dataset = loadDataset<typeof MANIFEST, DatasetRecords>({
  manifest: MANIFEST,
  dataDir: fileURLToPath(new URL("data", import.meta.url)),
  placeholders: PLACEHOLDERS,
});

export { MANIFEST } from "./manifest.ts";
