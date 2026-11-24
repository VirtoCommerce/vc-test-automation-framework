import type { Manifest, SeedEvent, SeedSummary } from "@virtocommerce/test-automation-framework/dataset";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { fileURLToPath } from "node:url";

import {
  envPlaceholder,
  loadDataset,
  parseCollectionNames,
  recordPlaceholder,
  seedDataset,
} from "@virtocommerce/test-automation-framework/dataset";
import { InstalledModules } from "@virtocommerce/test-automation-framework/modules";

const CATALOG = { id: "VirtoCommerce.Catalog", minVersion: "3.1051.0" };
const SHIPPING = { id: "VirtoCommerce.Shipping", minVersion: "3.1010.0" };

export const MANIFEST = {
  catalogs: { module: CATALOG, method: "POST", path: "/api/catalog/catalogs", send: "each" },
  categories: {
    module: CATALOG,
    method: "POST",
    path: "/api/catalog/categories",
    send: "each",
    key: "code",
    parentField: "parentId",
  },
  shippingMethods: {
    module: SHIPPING,
    method: "PUT",
    path: "/api/shipping",
    send: "each",
    key: "code",
    storedIdFrom: {
      searchPath: "/api/shipping/search",
      criteria: { storeId: envPlaceholder("STORE_ID"), codes: [recordPlaceholder("code")] },
      match: "code",
    },
  },
} as const satisfies Manifest;

type Catalog = { readonly id: string; readonly name: string };

const PLACEHOLDERS = { STORE_ID: "B2B-store" };

export const dataset = loadDataset<typeof MANIFEST, { readonly catalogs: Catalog }>({
  manifest: MANIFEST,
  dataDir: fileURLToPath(new URL("data", import.meta.url)),
  placeholders: PLACEHOLDERS,
});

export function catalogName(id: string): string {
  return dataset.catalogs.get(id).name;
}

export async function seed(
  admin: HttpClient,
  only: string | undefined,
  onEvent: (event: SeedEvent) => void,
): Promise<SeedSummary<typeof MANIFEST>> {
  return seedDataset({
    http: admin,
    manifest: MANIFEST,
    dataset,
    installed: await InstalledModules.read(admin),
    only: parseCollectionNames(MANIFEST, only),
    placeholders: PLACEHOLDERS,
    onEvent,
  });
}
