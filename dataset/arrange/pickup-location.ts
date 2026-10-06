import type { ProductPickupLocationFragment } from "@api/graphql/generated/graphql";
import type { PickupLocationsClient } from "@api/rest/clients/pickup-locations-client";
import type { PickupLocation } from "@api/rest/types/shipping";
import type { CleanupStack } from "@core/cleanup-stack";
import type { PickupLocationDraft, PickupLocationSources } from "../builders/shipping";

import { expect } from "@playwright/test";

import { uniqueId } from "@core/unique-id";

import { newPickupLocation } from "../builders/shipping";

export const PICKUP_INDEXING_TIMEOUT_MS = 30_000;

export async function arrangePickupLocation(
  pickupLocationsClient: PickupLocationsClient,
  cleanupStack: CleanupStack,
  draft: PickupLocationDraft,
): Promise<PickupLocation> {
  cleanupStack.push(`delete pickup location ${draft.name}`, () =>
    pickupLocationsClient.delete(draft.storeId, draft.id),
  );
  return pickupLocationsClient.create(draft);
}

export interface ArrangedPickupLocations {
  readonly namePrefix: string;
  readonly locations: readonly PickupLocation[];
}

export async function arrangePickupLocations(
  pickupLocationsClient: PickupLocationsClient,
  cleanupStack: CleanupStack,
  storeId: string,
  sources: readonly PickupLocationSources[],
): Promise<ArrangedPickupLocations> {
  const namePrefix = uniqueId("test-pickup");
  const locations: PickupLocation[] = [];
  for (const source of sources) {
    locations.push(
      await arrangePickupLocation(pickupLocationsClient, cleanupStack, newPickupLocation(storeId, namePrefix, source)),
    );
  }
  return { namePrefix, locations };
}

export function locationsArrangedIn<Location extends { readonly name: string }>(
  locations: readonly (Location | null)[],
  arranged: ArrangedPickupLocations,
): Location[] {
  return locations.filter((location): location is Location => location?.name.startsWith(arranged.namePrefix) ?? false);
}

export async function waitForArrangedLocations<Location extends { readonly name: string }>(
  arranged: ArrangedPickupLocations,
  query: () => Promise<readonly (Location | null)[]>,
): Promise<Location[]> {
  let found: Location[] = [];
  await expect
    .poll(
      async () => {
        found = locationsArrangedIn(await query(), arranged);
        return found.length;
      },
      { timeout: PICKUP_INDEXING_TIMEOUT_MS },
    )
    .toBe(arranged.locations.length);
  return found;
}

export function availabilityByCity(locations: readonly ProductPickupLocationFragment[]): Record<string, string | null> {
  return Object.fromEntries(locations.map((location) => [location.address?.city, location.availabilityType]));
}
