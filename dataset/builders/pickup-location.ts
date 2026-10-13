import type { PickupLocationAddress, PickupLocationData } from "@api/rest/types/shipping";
import type { WithRequired } from "@core/required-fields";

import { uniqueId } from "@core/unique-id";

import { TEST_ADDRESS } from "./address";

/** A pickup location to create, with its id chosen up front. */
export type PickupLocationDraft = WithRequired<PickupLocationData, "id" | "storeId" | "name">;

/** Where a pickup location gets its goods, and the city that names it. */
export interface PickupLocationSources {
  /** Ends the location's name and is its address's city. */
  readonly city: string;
  /** The fulfillment center that stocks the location the same day; `null` for none. */
  readonly fulfillmentCenterId: string | null;
  /** The fulfillment centers that can transfer goods to the location. */
  readonly transferFulfillmentCenterIds: readonly string[];
  /** Other address fields, such as a region. */
  readonly address?: Partial<PickupLocationAddress>;
}

/**
 * Builds an active pickup location `<namePrefix> <city>` with a unique `test-pickup-location-…` id,
 * 2 delivery days, 7 storage days and a US address at `1 <city> Test Street`.
 *
 * @param namePrefix - Shared by one test's locations, so the test finds the ones it created.
 */
export function newPickupLocation(
  storeId: string,
  namePrefix: string,
  sources: PickupLocationSources,
): PickupLocationDraft {
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
