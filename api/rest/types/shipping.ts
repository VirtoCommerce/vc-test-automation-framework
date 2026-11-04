import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type PickupLocationAddress = Rest.VirtoCommerceShippingModuleCoreModelPickupLocationAddress;
export type PickupLocationData = Rest.VirtoCommerceShippingModuleCoreModelPickupLocation;
export type ShippingMethodData = Rest.VirtoCommerceShippingModuleCoreModelShippingMethod;

export const PICKUP_LOCATION = shape<PickupLocationData>()("Pickup location", ["id", "storeId", "name"]);
export type PickupLocation = Shaped<typeof PICKUP_LOCATION>;
