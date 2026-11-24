import type {
  VirtoCommerceShippingModuleCoreModelPickupLocation as PickupLocation,
  VirtoCommerceShippingModuleCoreModelPickupLocationAddress as PickupLocationAddress,
} from "../rest/generated/platform.ts";

import { uniqueId } from "../support/unique-id.ts";
import { TEST_ADDRESS } from "./address.ts";

/** Where a pickup location gets its products: its own fulfillment center and its transfer centers. */
export interface PickupLocationSources {
  /** The city of the location, which also ends its name. */
  readonly city: string;
  /** The center that the location hands out the same day; `null` for none. */
  readonly fulfillmentCenterId: string | null;
  /** The centers that transfer products to the location. */
  readonly transferFulfillmentCenterIds: readonly string[];
  /** Fields of the address to change. */
  readonly address?: Partial<PickupLocationAddress>;
}

/**
 * Returns a new active pickup location of a store, named `<namePrefix> <city>`.
 *
 * @param storeId - The store of the location.
 * @param namePrefix - The prefix that the names of the locations of one test share.
 * @param sources - The city and the fulfillment centers of the location.
 * @returns The location.
 */
export function newPickupLocation(storeId: string, namePrefix: string, sources: PickupLocationSources): PickupLocation {
  return {
    id: uniqueId("test-pickup-location"),
    storeId,
    name: `${namePrefix} ${sources.city}`,
    isActive: true,
    fulfillmentCenterId: sources.fulfillmentCenterId,
    transferFulfillmentCenterIds: [...sources.transferFulfillmentCenterIds],
    deliveryDays: 2,
    storageDays: 7,
    address: {
      city: sources.city,
      countryCode: TEST_ADDRESS.countryCode,
      countryName: TEST_ADDRESS.countryName,
      line1: `1 ${sources.city} Test Street`,
      postalCode: TEST_ADDRESS.postalCode,
      ...sources.address,
    },
  };
}
