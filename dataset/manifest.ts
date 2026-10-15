import type { HttpMethod } from "@api/http/http-method";
import type { ModuleRequirement } from "@core/modules";

import { MODULES } from "./modules";

/** How the records of one collection are sent to the platform. */
export interface CollectionSpec {
  /** The module, and its version range, the collection needs; without it the collection is skipped. */
  readonly module: ModuleRequirement;
  /**
   * Starts record ids: ids are `<idPrefix>-<slug>` and files `<slug>.json`.
   * Absent when records have no id of their own (the platform keys them by `keys`).
   */
  readonly idPrefix?: string;
  /**
   * What identifies a record besides its id: a field, or a list of fields forming one key.
   * Each key is unique within the collection; the first names the files of records without an id.
   */
  readonly keys?: readonly (string | readonly string[])[];
  /** The method of the seed request. */
  readonly method: HttpMethod;
  /** The seed request's path; may contain `${ENV:…}` and, with `send: "each"`, `${RECORD:field}`. */
  readonly endpoint: `/${string}`;
  /**
   * The path that finds an existing record, for collections that must not be sent twice: a stored record is left
   * as it is. With `send: "all"`, the records not found are sent together in one request.
   */
  readonly find?: `/${string}`;
  /**
   * The path whose `ETag` the seed request sends as `If-Match`, for endpoints that refuse a write without the
   * current version (428). Read right before each request; without an `ETag` (older modules) none is sent.
   */
  readonly ifMatchFrom?: `/${string}`;
  /** `each`: one request per record; `all`: one request with every record. */
  readonly send: "each" | "all";
  /** The field that references a parent record in the same collection; parents are sent first. */
  readonly parentField?: string;
}

/**
 * The dataset's collections in seed order, and how each one is sent. Each collection's records are the JSON
 * files in `dataset/data/<collection name in kebab case>` (see {@link collectionDir}).
 */
export const MANIFEST = {
  globalPlatformSettings: {
    module: MODULES.core,
    method: "POST",
    endpoint: "/api/platform/settings/v2/global/values",
    send: "each",
  },
  platformSettings: {
    module: MODULES.core,
    idPrefix: "platform-setting",
    keys: ["name"],
    method: "POST",
    endpoint: "/api/platform/settings",
    send: "all",
  },
  currencies: {
    module: MODULES.core,
    keys: ["code"],
    method: "POST",
    endpoint: "/api/currencies",
    send: "each",
  },
  measures: {
    module: MODULES.catalog,
    idPrefix: "measure",
    keys: ["code"],
    method: "PUT",
    endpoint: "/api/catalog/measures",
    send: "each",
  },
  fulfillmentCenters: {
    module: MODULES.inventory,
    idPrefix: "fulfillment-center",
    method: "PUT",
    endpoint: "/api/inventory/fulfillmentcenters",
    send: "each",
  },
  pricelists: {
    module: MODULES.pricing,
    idPrefix: "pricelist",
    method: "POST",
    endpoint: "/api/pricing/pricelists",
    send: "each",
  },
  catalogs: {
    module: MODULES.catalog,
    idPrefix: "catalog",
    method: "POST",
    endpoint: "/api/catalog/catalogs",
    send: "each",
  },
  pricelistAssignments: {
    module: MODULES.pricing,
    idPrefix: "pricelist-assignment",
    method: "POST",
    endpoint: "/api/pricing/assignments",
    send: "each",
  },
  catalogPropertyGroups: {
    module: MODULES.catalog,
    idPrefix: "catalog-property-group",
    method: "POST",
    endpoint: "/api/catalog/propertygroups",
    send: "each",
  },
  stores: {
    module: MODULES.store,
    method: "POST",
    endpoint: "/api/stores",
    send: "each",
  },
  categories: {
    module: MODULES.catalog,
    idPrefix: "category",
    keys: ["code"],
    method: "POST",
    endpoint: "/api/catalog/categories",
    send: "each",
    parentField: "parentId",
  },
  catalogProperties: {
    module: MODULES.catalog,
    idPrefix: "catalog-property",
    method: "POST",
    endpoint: "/api/catalog/properties?id=${RECORD:id}",
    send: "each",
  },
  products: {
    module: MODULES.catalog,
    idPrefix: "product",
    keys: ["code"],
    method: "POST",
    endpoint: "/api/catalog/products",
    send: "each",
    parentField: "mainProductId",
  },
  aggregationProperties: {
    module: MODULES.catalog,
    keys: ["name"],
    method: "PUT",
    endpoint: "/api/catalog/aggregationproperties/${ENV:STORE_ID}/properties",
    send: "all",
  },
  productInventories: {
    module: MODULES.inventory,
    keys: [["productId", "fulfillmentCenterId"]],
    method: "PUT",
    endpoint: "/api/inventory/products/${RECORD:productId}",
    send: "each",
  },
  productConfigurations: {
    module: MODULES.catalog,
    idPrefix: "product-configuration",
    keys: ["productId"],
    method: "POST",
    endpoint: "/api/catalog/products/configurations",
    send: "each",
  },
  prices: {
    module: MODULES.pricing,
    keys: ["productId"],
    method: "PUT",
    endpoint: "/api/products/${RECORD:productId}/prices",
    send: "each",
  },
  promotions: {
    module: MODULES.marketing,
    idPrefix: "promotion",
    method: "POST",
    endpoint: "/api/marketing/promotions",
    send: "each",
  },
  coupons: {
    module: MODULES.marketing,
    idPrefix: "coupon",
    keys: ["code"],
    method: "POST",
    endpoint: "/api/marketing/promotions/coupons/add",
    find: "/api/marketing/promotions/coupons/${RECORD:id}",
    send: "all",
  },
  roles: {
    module: MODULES.core,
    idPrefix: "role",
    keys: ["name"],
    method: "PUT",
    endpoint: "/api/platform/security/roles",
    send: "each",
  },
  organizations: {
    module: MODULES.customer,
    idPrefix: "organization",
    method: "POST",
    endpoint: "/api/members",
    send: "each",
  },
  contacts: {
    module: MODULES.customer,
    idPrefix: "contact",
    method: "POST",
    endpoint: "/api/members",
    send: "each",
  },
  users: {
    module: MODULES.core,
    idPrefix: "user",
    keys: ["userName"],
    method: "POST",
    endpoint: "/api/platform/security/users/create",
    find: "/api/platform/security/users/${RECORD:userName}",
    send: "each",
  },
  organizationMemberships: {
    module: MODULES.customer,
    keys: [["userId", "organizationId"]],
    method: "POST",
    endpoint: "/api/customer/organization-memberships",
    find: "/api/customer/organization-memberships/user/${RECORD:userId}/org/${RECORD:organizationId}",
    send: "each",
  },
  pickupLocations: {
    module: MODULES.pickup,
    idPrefix: "pickup-location",
    method: "POST",
    endpoint: "/api/shipping/pickup-locations",
    send: "each",
  },
  orders: {
    module: MODULES.orders,
    idPrefix: "order",
    keys: ["number"],
    method: "POST",
    endpoint: "/api/order/customerOrders",
    find: "/api/order/customerOrders/${RECORD:id}",
    send: "each",
  },
  notifications: {
    module: MODULES.notifications,
    keys: ["type"],
    method: "PUT",
    endpoint: "/api/notifications/${RECORD:type}",
    send: "each",
  },
  shippingMethods: {
    module: MODULES.shipping,
    keys: ["code"],
    method: "PUT",
    endpoint: "/api/shipping",
    send: "each",
  },
  paymentMethods: {
    module: MODULES.payment,
    keys: ["code"],
    method: "PUT",
    endpoint: "/api/payment",
    send: "each",
  },
  pages: {
    module: MODULES.pageBuilder,
    idPrefix: "page",
    method: "POST",
    endpoint: "/api/page-builder-pages/grouped",
    send: "each",
  },
  pagesContent: {
    module: MODULES.pageBuilder,
    keys: ["pageId"],
    method: "POST",
    endpoint: "/api/page-builder-pages/grouped/${RECORD:pageId}/content",
    ifMatchFrom: "/api/page-builder-pages/grouped/${RECORD:pageId}/content",
    send: "each",
  },
} as const satisfies Readonly<Record<string, CollectionSpec>>;

/** The name of a collection, such as `products` or `productInventories`. */
export type CollectionName = keyof typeof MANIFEST;

/** Every collection name, in seed order. */
export const COLLECTION_NAMES = Object.keys(MANIFEST) as readonly CollectionName[];

/** Tells whether a text, such as a `SEED_ONLY` entry, is the exact name of a collection. */
export function isCollectionName(name: string): name is CollectionName {
  return Object.hasOwn(MANIFEST, name);
}

/** Returns a collection's folder under `dataset/data`: its kebab-case name, such as `product-inventories`. */
export function collectionDir(name: CollectionName): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
