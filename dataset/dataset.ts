import type { CatalogData, CatalogProductData, CategoryData } from "@api/rest/types/catalog";
import type { CurrencyData } from "@api/rest/types/core";
import type { ContactData, OrganizationData } from "@api/rest/types/customers";
import type { FulfillmentCenterData, InventoryInfoData } from "@api/rest/types/inventory";
import type { CouponData, PromotionData } from "@api/rest/types/marketing";
import type { OrganizationMembershipData } from "@api/rest/types/memberships";
import type { CustomerOrderData } from "@api/rest/types/orders";
import type { PricelistAssignmentData, PricelistData, ProductPriceData } from "@api/rest/types/pricing";
import type { ApplicationUserData, RoleData } from "@api/rest/types/security";
import type { SettingEntryData } from "@api/rest/types/settings";
import type { PickupLocationData, ShippingMethodData } from "@api/rest/types/shipping";
import type { StoreData } from "@api/rest/types/store";
import type { CollectionName } from "./manifest";
import type { EnvPlaceholders } from "./placeholders";

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { deepFreeze } from "@core/deep-freeze";
import { interpolate, jsonStringContent } from "@core/interpolate";
import { Secret } from "@core/secret";

import { Collection } from "./collection";
import { COLLECTION_NAMES, collectionDir } from "./manifest";
import { envPlaceholders } from "./placeholders";

/** A record without a known platform type: a JSON object. */
export type DatasetRecord = Readonly<Record<string, unknown>>;

interface TypedRecords {
  readonly catalogs: CatalogData;
  readonly categories: CategoryData;
  readonly contacts: ContactData;
  readonly coupons: CouponData;
  readonly currencies: CurrencyData;
  readonly fulfillmentCenters: FulfillmentCenterData;
  readonly orders: CustomerOrderData;
  readonly organizationMemberships: OrganizationMembershipData;
  readonly organizations: OrganizationData;
  readonly pickupLocations: PickupLocationData;
  readonly platformSettings: SettingEntryData;
  readonly pricelistAssignments: PricelistAssignmentData;
  readonly pricelists: PricelistData;
  readonly prices: ProductPriceData;
  readonly productInventories: InventoryInfoData;
  readonly products: CatalogProductData;
  readonly promotions: PromotionData;
  readonly roles: RoleData;
  readonly shippingMethods: ShippingMethodData;
  readonly stores: StoreData;
  readonly users: ApplicationUserData;
}

/** The record type of a collection: its generated platform type where there is one, else {@link DatasetRecord}. */
export type CollectionRecord<Name extends CollectionName> = Name extends keyof TypedRecords
  ? TypedRecords[Name]
  : DatasetRecord;

/** The whole dataset: one {@link Collection} per collection of the manifest. */
export type Dataset = { readonly [Name in CollectionName]: Collection<CollectionRecord<Name>> };

const DATA_DIR = resolve(__dirname, "data");

/**
 * Reads every collection from `dataset/data`, fills in `${ENV:…}` placeholders and deep-freezes the records.
 * Files are read in path order; record types are not checked here (`tests/unit/dataset/data.test.ts` guards the data).
 *
 * @param placeholders - The environment's by default; fake ones in unit tests.
 * @param dataDir - Holds the collections' folders; `dataset/data` by default.
 * @throws Error naming the file when a placeholder cannot be filled in or the JSON is invalid; secrets are masked.
 */
export function loadDataset(placeholders: EnvPlaceholders = envPlaceholders(), dataDir: string = DATA_DIR): Dataset {
  const collections: Record<string, Collection<object>> = {};
  for (const name of COLLECTION_NAMES) {
    collections[name] = new Collection(name, readRecords(join(dataDir, collectionDir(name)), dataDir, placeholders));
  }
  return collections as Dataset;
}

function readRecords(dir: string, dataDir: string, placeholders: EnvPlaceholders): object[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
    .map((path) => readRecord(path, relative(dataDir, path), placeholders));
}

function readRecord(path: string, name: string, placeholders: EnvPlaceholders): object {
  try {
    const text = interpolate(readFileSync(path, "utf8"), { ENV: (key) => placeholders[key] }, jsonStringContent);
    return deepFreeze(JSON.parse(text) as object);
  } catch (error) {
    throw new Error(Secret.mask(`Dataset file ${name}: ${error instanceof Error ? error.message : String(error)}`));
  }
}
