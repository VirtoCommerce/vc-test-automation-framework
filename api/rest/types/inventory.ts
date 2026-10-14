import type { WithRequired } from "@core/required-fields";
import type {
  VirtoCommerceInventoryModuleCoreModelFulfillmentCenter as FulfillmentCenterData,
  VirtoCommerceInventoryModuleCoreModelInventoryInfo as InventoryInfoData,
} from "../generated/rest-api";

export type { FulfillmentCenterData, InventoryInfoData };

const INVENTORY_INFO_FIELDS = ["productId", "fulfillmentCenterId", "inStockQuantity"] as const;

export type InventoryInfo = WithRequired<InventoryInfoData, (typeof INVENTORY_INFO_FIELDS)[number]>;
