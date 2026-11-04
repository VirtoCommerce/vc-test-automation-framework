import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type FulfillmentCenterData = Rest.VirtoCommerceInventoryModuleCoreModelFulfillmentCenter;
export type InventoryInfoData = Rest.VirtoCommerceInventoryModuleCoreModelInventoryInfo;

export const INVENTORY_INFO = shape<InventoryInfoData>()("Inventory info", [
  "productId",
  "fulfillmentCenterId",
  "inStockQuantity",
]);
export type InventoryInfo = Shaped<typeof INVENTORY_INFO>;
