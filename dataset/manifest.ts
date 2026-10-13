import type { HttpMethod } from "@api/http/http-method";

/** How the records of one collection are sent to the platform. */
export interface CollectionSpec {
  /** The module that must be installed for the collection to be seeded. */
  readonly moduleId: string;
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
  /** The path that finds an existing record, for collections that must not be sent twice. */
  readonly find?: `/${string}`;
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
    moduleId: "VirtoCommerce.Core",
    method: "POST",
    endpoint: "/api/platform/settings/v2/global/values",
    send: "each",
  },
  platformSettings: {
    moduleId: "VirtoCommerce.Core",
    idPrefix: "platform-setting",
    keys: ["name"],
    method: "POST",
    endpoint: "/api/platform/settings",
    send: "all",
  },
  currencies: {
    moduleId: "VirtoCommerce.Core",
    keys: ["code"],
    method: "POST",
    endpoint: "/api/currencies",
    send: "each",
  },
  measures: {
    moduleId: "VirtoCommerce.Catalog",
    idPrefix: "measure",
    keys: ["code"],
    method: "PUT",
    endpoint: "/api/catalog/measures",
    send: "each",
  },
  fulfillmentCenters: {
    moduleId: "VirtoCommerce.Inventory",
    idPrefix: "fulfillment-center",
    method: "PUT",
    endpoint: "/api/inventory/fulfillmentcenters",
    send: "each",
  },
  pricelists: {
    moduleId: "VirtoCommerce.Pricing",
    idPrefix: "pricelist",
    method: "POST",
    endpoint: "/api/pricing/pricelists",
    send: "each",
  },
  catalogs: {
    moduleId: "VirtoCommerce.Catalog",
    idPrefix: "catalog",
    method: "POST",
    endpoint: "/api/catalog/catalogs",
    send: "each",
  },
  pricelistAssignments: {
    moduleId: "VirtoCommerce.Pricing",
    idPrefix: "pricelist-assignment",
    method: "POST",
    endpoint: "/api/pricing/assignments",
    send: "each",
  },
  catalogPropertyGroups: {
    moduleId: "VirtoCommerce.Catalog",
    idPrefix: "catalog-property-group",
    method: "POST",
    endpoint: "/api/catalog/propertygroups",
    send: "each",
  },
  stores: {
    moduleId: "VirtoCommerce.Store",
    method: "POST",
    endpoint: "/api/stores",
    send: "each",
  },
  categories: {
    moduleId: "VirtoCommerce.Catalog",
    idPrefix: "category",
    keys: ["code"],
    method: "POST",
    endpoint: "/api/catalog/categories",
    send: "each",
    parentField: "parentId",
  },
  catalogProperties: {
    moduleId: "VirtoCommerce.Catalog",
    idPrefix: "catalog-property",
    method: "POST",
    endpoint: "/api/catalog/properties?id=${RECORD:id}",
    send: "each",
  },
  products: {
    moduleId: "VirtoCommerce.Catalog",
    idPrefix: "product",
    keys: ["code"],
    method: "POST",
    endpoint: "/api/catalog/products",
    send: "each",
    parentField: "mainProductId",
  },
  aggregationProperties: {
    moduleId: "VirtoCommerce.Catalog",
    keys: ["name"],
    method: "PUT",
    endpoint: "/api/catalog/aggregationproperties/${ENV:STORE_ID}/properties",
    send: "all",
  },
  productInventories: {
    moduleId: "VirtoCommerce.Inventory",
    keys: [["productId", "fulfillmentCenterId"]],
    method: "PUT",
    endpoint: "/api/inventory/products/${RECORD:productId}",
    send: "each",
  },
  productConfigurations: {
    moduleId: "VirtoCommerce.Catalog",
    idPrefix: "product-configuration",
    keys: ["productId"],
    method: "POST",
    endpoint: "/api/catalog/products/configurations",
    send: "each",
  },
  prices: {
    moduleId: "VirtoCommerce.Pricing",
    keys: ["productId"],
    method: "PUT",
    endpoint: "/api/products/${RECORD:productId}/prices",
    send: "each",
  },
  promotions: {
    moduleId: "VirtoCommerce.Marketing",
    idPrefix: "promotion",
    method: "POST",
    endpoint: "/api/marketing/promotions",
    send: "each",
  },
  coupons: {
    moduleId: "VirtoCommerce.Marketing",
    keys: ["code"],
    method: "POST",
    endpoint: "/api/marketing/promotions/coupons/add",
    send: "all",
  },
  roles: {
    moduleId: "VirtoCommerce.Core",
    idPrefix: "role",
    keys: ["name"],
    method: "PUT",
    endpoint: "/api/platform/security/roles",
    send: "each",
  },
  organizations: {
    moduleId: "VirtoCommerce.Customer",
    idPrefix: "organization",
    method: "POST",
    endpoint: "/api/members",
    send: "each",
  },
  contacts: {
    moduleId: "VirtoCommerce.Customer",
    idPrefix: "contact",
    method: "POST",
    endpoint: "/api/members",
    send: "each",
  },
  users: {
    moduleId: "VirtoCommerce.Core",
    idPrefix: "user",
    keys: ["userName"],
    method: "POST",
    endpoint: "/api/platform/security/users/create",
    find: "/api/platform/security/users/${RECORD:userName}",
    send: "each",
  },
  organizationMemberships: {
    moduleId: "VirtoCommerce.Customer",
    keys: [["userId", "organizationId"]],
    method: "POST",
    endpoint: "/api/customer/organization-memberships",
    find: "/api/customer/organization-memberships/user/${RECORD:userId}/org/${RECORD:organizationId}",
    send: "each",
  },
  pickupLocations: {
    moduleId: "VirtoCommerce.XPickup",
    idPrefix: "pickup-location",
    method: "POST",
    endpoint: "/api/shipping/pickup-locations",
    send: "each",
  },
  orders: {
    moduleId: "VirtoCommerce.Orders",
    idPrefix: "order",
    keys: ["number"],
    method: "POST",
    endpoint: "/api/order/customerOrders",
    send: "each",
  },
  notifications: {
    moduleId: "VirtoCommerce.Notifications",
    keys: ["type"],
    method: "PUT",
    endpoint: "/api/notifications/${RECORD:type}",
    send: "each",
  },
  shippingMethods: {
    moduleId: "VirtoCommerce.Shipping",
    keys: ["code"],
    method: "PUT",
    endpoint: "/api/shipping",
    send: "each",
  },
  paymentMethods: {
    moduleId: "VirtoCommerce.Payment",
    keys: ["code"],
    method: "PUT",
    endpoint: "/api/payment",
    send: "each",
  },
  pages: {
    moduleId: "VirtoCommerce.PageBuilderModule",
    idPrefix: "page",
    method: "POST",
    endpoint: "/api/page-builder-pages/grouped",
    send: "each",
  },
  pagesContent: {
    moduleId: "VirtoCommerce.PageBuilderModule",
    keys: ["pageId"],
    method: "POST",
    endpoint: "/api/page-builder-pages/grouped/${RECORD:pageId}/content",
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
