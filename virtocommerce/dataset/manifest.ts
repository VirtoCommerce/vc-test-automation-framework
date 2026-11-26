import type { Manifest } from "@virtocommerce/test-automation-framework/dataset";

import { recordPlaceholder } from "@virtocommerce/test-automation-framework/dataset";

import { MODULES } from "../modules.ts";

/** The store that the dataset seeds; its records name it, and tests find it through the frontend's domain. */
export const DATASET_STORE_ID = "store-acme";

/**
 * The collections of the Virto Commerce dataset in seed order, and how each one is sent. The records of a collection
 * are the JSON files in `dataset/data/<collection name in kebab case>`.
 */
export const MANIFEST = {
  globalPlatformSettings: {
    module: MODULES.core,
    method: "POST",
    path: "/api/platform/settings/v2/global/values",
    send: "each",
  },
  platformSettings: {
    module: MODULES.core,
    key: "name",
    method: "POST",
    path: "/api/platform/settings",
    send: "all",
  },
  currencies: {
    module: MODULES.core,
    key: "code",
    method: "POST",
    path: "/api/currencies",
    send: "each",
  },
  measures: {
    module: MODULES.catalog,
    key: "code",
    method: "PUT",
    path: "/api/catalog/measures",
    send: "each",
  },
  fulfillmentCenters: {
    module: MODULES.inventory,
    method: "PUT",
    path: "/api/inventory/fulfillmentcenters",
    send: "each",
  },
  pricelists: {
    module: MODULES.pricing,
    method: "POST",
    path: "/api/pricing/pricelists",
    send: "each",
  },
  catalogs: {
    module: MODULES.catalog,
    method: "POST",
    path: "/api/catalog/catalogs",
    send: "each",
  },
  pricelistAssignments: {
    module: MODULES.pricing,
    method: "POST",
    path: "/api/pricing/assignments",
    send: "each",
  },
  catalogPropertyGroups: {
    module: MODULES.catalog,
    method: "POST",
    path: "/api/catalog/propertygroups",
    send: "each",
  },
  stores: {
    module: MODULES.store,
    method: "POST",
    path: "/api/stores",
    send: "each",
  },
  storeAuthenticationSchemes: {
    module: MODULES.otp,
    key: "name",
    method: "PUT",
    path: `/api/store-authentication-schemes/${DATASET_STORE_ID}`,
    send: "all",
  },
  categories: {
    module: MODULES.catalog,
    key: "code",
    method: "POST",
    path: "/api/catalog/categories",
    send: "each",
    parentField: "parentId",
  },
  catalogProperties: {
    module: MODULES.catalog,
    method: "POST",
    path: `/api/catalog/properties?id=${recordPlaceholder("id")}`,
    send: "each",
  },
  products: {
    module: MODULES.catalog,
    key: "code",
    method: "POST",
    path: "/api/catalog/products",
    send: "each",
    parentField: "mainProductId",
  },
  aggregationProperties: {
    module: MODULES.catalog,
    key: "name",
    method: "PUT",
    path: `/api/catalog/aggregationproperties/${DATASET_STORE_ID}/properties`,
    send: "all",
  },
  productInventories: {
    module: MODULES.inventory,
    key: ["productId", "fulfillmentCenterId"],
    method: "PUT",
    path: `/api/inventory/products/${recordPlaceholder("productId")}`,
    send: "each",
  },
  productConfigurations: {
    module: MODULES.catalog,
    key: "productId",
    method: "POST",
    path: "/api/catalog/products/configurations",
    send: "each",
  },
  prices: {
    module: MODULES.pricing,
    key: "productId",
    method: "PUT",
    path: `/api/products/${recordPlaceholder("productId")}/prices`,
    send: "each",
  },
  promotions: {
    module: MODULES.marketing,
    method: "POST",
    path: "/api/marketing/promotions",
    send: "each",
  },
  coupons: {
    module: MODULES.marketing,
    key: "code",
    method: "POST",
    path: "/api/marketing/promotions/coupons/add",
    findPath: `/api/marketing/promotions/coupons/${recordPlaceholder("id")}`,
    send: "all",
  },
  roles: {
    module: MODULES.core,
    key: "name",
    method: "PUT",
    path: "/api/platform/security/roles",
    send: "each",
  },
  organizations: {
    module: MODULES.customer,
    method: "POST",
    path: "/api/members",
    send: "each",
  },
  contacts: {
    module: MODULES.customer,
    method: "POST",
    path: "/api/members",
    send: "each",
  },
  users: {
    module: MODULES.core,
    key: "userName",
    method: "POST",
    path: "/api/platform/security/users/create",
    findPath: `/api/platform/security/users/${recordPlaceholder("userName")}`,
    send: "each",
  },
  organizationMemberships: {
    module: MODULES.customer,
    key: ["userId", "organizationId"],
    method: "POST",
    path: "/api/customer/organization-memberships",
    findPath: `/api/customer/organization-memberships/user/${recordPlaceholder("userId")}/org/${recordPlaceholder("organizationId")}`,
    send: "each",
  },
  pickupLocations: {
    module: MODULES.pickup,
    method: "POST",
    path: "/api/shipping/pickup-locations",
    send: "each",
  },
  orders: {
    module: MODULES.orders,
    key: "number",
    method: "POST",
    path: "/api/order/customerOrders",
    findPath: `/api/order/customerOrders/${recordPlaceholder("id")}`,
    send: "each",
  },
  notifications: {
    module: MODULES.notifications,
    key: "type",
    method: "PUT",
    path: `/api/notifications/${recordPlaceholder("type")}`,
    send: "each",
  },
  shippingMethods: {
    module: MODULES.shipping,
    key: "code",
    method: "PUT",
    path: "/api/shipping",
    send: "each",
    storedIdFrom: {
      searchPath: "/api/shipping/search",
      criteria: { storeId: DATASET_STORE_ID, codes: [recordPlaceholder("code")], withoutTransient: true },
      match: "code",
    },
  },
  paymentMethods: {
    module: MODULES.payment,
    key: "code",
    method: "PUT",
    path: "/api/payment",
    send: "each",
    storedIdFrom: {
      searchPath: "/api/payment/search",
      criteria: { storeId: DATASET_STORE_ID, codes: [recordPlaceholder("code")], withoutTransient: true },
      match: "code",
    },
  },
  pages: {
    module: MODULES.pageBuilder,
    method: "POST",
    path: "/api/page-builder-pages/grouped",
    send: "each",
  },
  pagesContent: {
    module: MODULES.pageBuilder,
    key: "pageId",
    method: "POST",
    path: `/api/page-builder-pages/grouped/${recordPlaceholder("pageId")}/content`,
    ifMatchPath: `/api/page-builder-pages/grouped/${recordPlaceholder("pageId")}/content`,
    send: "each",
  },
} as const satisfies Manifest;
