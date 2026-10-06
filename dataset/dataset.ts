import type { Credentials } from "@api/auth/credentials";
import type { CatalogProduct, CatalogProductData } from "@api/rest/types/catalog";
import type { ContactData } from "@api/rest/types/customers";
import type { FulfillmentCenterData, InventoryInfoData } from "@api/rest/types/inventory";
import type { CustomerOrderData } from "@api/rest/types/orders";
import type { PriceData, ProductPriceData } from "@api/rest/types/pricing";
import type { ApplicationUserData } from "@api/rest/types/security";
import type { StoreData } from "@api/rest/types/store";
import type { WithRequired } from "@core/required-fields";
import type { ManifestItemName } from "./manifest";

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { CATALOG_PRODUCT_FIELDS } from "@api/rest/types/catalog";
import { deepFreeze } from "@core/deep-freeze";
import { getEnv } from "@core/env";
import { interpolate, jsonStringContent } from "@core/interpolate";
import { requireFields } from "@core/required-fields";

import { MANIFEST_ITEMS } from "./manifest";

export type DatasetItem = Readonly<Record<string, unknown>>;

interface DatasetItemTypes {
  readonly contacts: ContactData;
  readonly fulfillmentCenters: FulfillmentCenterData;
  readonly orders: CustomerOrderData;
  readonly prices: ProductPriceData;
  readonly productInventories: InventoryInfoData;
  readonly products: CatalogProductData;
  readonly stores: StoreData;
  readonly users: ApplicationUserData;
}

export type Dataset = {
  readonly [Name in ManifestItemName]: readonly (Name extends keyof DatasetItemTypes
    ? DatasetItemTypes[Name]
    : DatasetItem)[];
};

const DATA_DIR = resolve(__dirname, "data");
const USER_FIELDS = ["id", "userName", "password"] as const;

export type DatasetUser = WithRequired<ApplicationUserData, (typeof USER_FIELDS)[number]>;

export function loadDataset(): Dataset {
  const dataset = {} as Record<ManifestItemName, unknown[]>;
  for (const { name, dir } of MANIFEST_ITEMS) {
    dataset[name] = readItems(join(DATA_DIR, dir));
  }
  return deepFreeze(dataset) as Dataset;
}

export function getUser(dataset: Dataset, username: string): DatasetUser {
  const user = dataset.users.find((item) => item.userName === username);
  return requireFields(user, USER_FIELDS, `Dataset user "${username}"`);
}

export function getCredentials(dataset: Dataset, username: string): Credentials {
  return { username, password: getUser(dataset, username).password };
}

export function getProduct(dataset: Dataset, id: string): CatalogProduct {
  const product = dataset.products.find((item) => item.id === id);
  return requireFields(product, CATALOG_PRODUCT_FIELDS, `Dataset product "${id}"`);
}

export function getProductPrices(dataset: Dataset, productId: string): readonly PriceData[] {
  const item = dataset.prices.find((entry) => entry.productId === productId);
  return requireFields(item, ["prices"], `Dataset prices of "${productId}"`).prices;
}

export function fromEnv(key: string): string | undefined {
  const { storeId, frontendBaseUrl, usersPassword, googleMapsApiKey } = getEnv();
  const values: Readonly<Record<string, string>> = {
    STORE_ID: storeId,
    FRONTEND_BASE_URL: frontendBaseUrl,
    USERS_PASSWORD: usersPassword,
    GOOGLE_MAPS_API_KEY: googleMapsApiKey,
  };
  return values[key];
}

function readItems(dir: string): unknown[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((item) => item.isFile() && item.name.endsWith(".json"))
    .map((item) => join(item.parentPath, item.name))
    .sort()
    .map((file) => JSON.parse(interpolate(readFileSync(file, "utf-8"), { ENV: fromEnv }, jsonStringContent)));
}
