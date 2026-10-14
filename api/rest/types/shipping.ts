import type { WithRequired } from "@core/required-fields";
import type {
  VirtoCommerceShippingModuleCoreModelPickupLocationAddress as PickupLocationAddress,
  VirtoCommerceShippingModuleCoreModelPickupLocation as PickupLocationData,
  VirtoCommerceShippingModuleCoreModelShippingMethod as ShippingMethodData,
} from "../generated/rest-api";

export type { PickupLocationAddress, PickupLocationData, ShippingMethodData };

export const PICKUP_LOCATION_FIELDS = ["id", "storeId", "name"] as const;

export type PickupLocation = WithRequired<PickupLocationData, (typeof PICKUP_LOCATION_FIELDS)[number]>;
