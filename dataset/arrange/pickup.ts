import type { ApiSession } from "@api/api-session";
import type { PickupLocation } from "@api/rest/types/shipping";
import type { CleanupStack } from "@core/cleanup-stack";
import type { PickupLocationSources } from "../builders/pickup-location";
import type { StoreUnderTest } from "../store-under-test";
import type { ArrangeContext } from "./context";

import {
  CartPickupLocationsDocument,
  PickupLocationsDocument,
  ProductPickupLocationsDocument,
} from "@api/graphql/generated/graphql";
import { INDEX_LAG_TIMEOUT_MS, pollUntil } from "@core/poll";
import { requireFields } from "@core/required-fields";
import { uniqueId } from "@core/unique-id";

import { newPickupLocation } from "../builders/pickup-location";
import { SEARCH_PAGE_SIZE } from "./context";

/** The fields of a pickup location search result that `byCity` reads. */
interface FoundPickupLocation {
  readonly name?: string | null;
  readonly address?: { readonly city?: string | null } | null;
}

/** Pickup locations created for one test, each named `<namePrefix> <city>`. */
export interface ArrangedPickupLocations {
  readonly namePrefix: string;
  readonly locations: readonly PickupLocation[];
  /**
   * Maps the arranged locations in a search result by city; other locations are ignored.
   *
   * @example
   * arranged.byCity(productPickupLocations?.items, (location) => location.availabilityType);
   * // { Sameday: "Today", Transferville: "Transfer" }
   *
   * @param pick - The value to report for each location.
   */
  byCity<Found extends FoundPickupLocation, Value>(
    found: readonly (Found | null)[] | null | undefined,
    pick: (location: Found) => Value,
  ): Record<string, Value>;
}

/** Arranges store pickup locations and waits until cart and product pickup searches find them. */
export class PickupArrange {
  readonly #admin: ApiSession;
  readonly #cleanup: CleanupStack;
  readonly #store: StoreUnderTest;

  constructor({ admin, cleanup, store }: ArrangeContext) {
    this.#admin = admin;
    this.#cleanup = cleanup;
    this.#store = store;
  }

  /**
   * Creates active store pickup locations sharing a unique name prefix, waits until xAPI keyword search finds
   * them all, and deletes them after the test. Use {@link PickupArrange#pickupLocation} for one location, and then
   * {@link PickupArrange#cartPickupLocations} before checking a cart's pickup options.
   *
   * @param sources - One per location: its city and fulfillment centers.
   * @throws Error when a location is not searchable within 60 s.
   */
  async pickupLocations(sources: readonly PickupLocationSources[]): Promise<ArrangedPickupLocations> {
    const { pickupLocations } = this.#admin.rest;
    const storeId = this.#store.id;
    const namePrefix = uniqueId("test-pickup");
    const locations: PickupLocation[] = [];
    for (const source of sources) {
      const draft = newPickupLocation(storeId, namePrefix, source);
      locations.push(
        await this.#cleanup.track(
          `delete pickup location ${draft.name}`,
          () => pickupLocations.delete(storeId, draft.id),
          () => pickupLocations.create(draft),
        ),
      );
    }
    const names = locations.map(({ name }) => name);
    await pollUntil(
      async () => {
        const { pickupLocations: found } = await this.#admin.graphql.execute(PickupLocationsDocument, {
          storeId,
          keyword: namePrefix,
          first: SEARCH_PAGE_SIZE,
        });
        return found?.items?.map((location) => location?.name) ?? [];
      },
      (found) => names.every((name) => found.includes(name)),
      { describe: `pickup locations ${namePrefix} to be searchable`, timeoutMs: INDEX_LAG_TIMEOUT_MS },
    );
    return {
      namePrefix,
      locations,
      byCity: (found, pick) =>
        Object.fromEntries(
          (found ?? []).flatMap((location) =>
            location?.name?.startsWith(`${namePrefix} `) ? [[location.address?.city, pick(location)]] : [],
          ),
        ),
    };
  }

  /**
   * Creates one active pickup location via {@link PickupArrange#pickupLocations}; waits up to 60 s for search and
   * deletes it after the test. Use the plural method when you need `byCity` or
   * {@link PickupArrange#cartPickupLocations}.
   */
  async pickupLocation(source: PickupLocationSources): Promise<PickupLocation> {
    const { locations } = await this.pickupLocations([source]);
    return requireFields(locations[0], ["id"], `Pickup location in ${source.city}`);
  }

  /**
   * Waits until the cart's pickup locations include every arranged location; creates nothing. Call it after
   * {@link PickupArrange#pickupLocations} and before checking a cart's pickup options, as this list lags further
   * behind.
   *
   * @param shopper - Session of the cart's owner.
   * @throws Error when a location is missing after 60 s.
   */
  async cartPickupLocations(shopper: ApiSession, cartId: string, arranged: ArrangedPickupLocations): Promise<void> {
    const { storeId, cultureName } = await shopper.storeContext();
    const names = arranged.locations.map(({ name }) => name);
    await pollUntil(
      async () => {
        const { cartPickupLocations } = await shopper.graphql.execute(CartPickupLocationsDocument, {
          cartId,
          storeId,
          cultureName,
          keyword: arranged.namePrefix,
          first: SEARCH_PAGE_SIZE,
        });
        return cartPickupLocations?.items?.map((location) => location?.name) ?? [];
      },
      (found) => names.every((name) => found.includes(name)),
      {
        describe: `cart ${cartId} to be picked up at ${arranged.namePrefix} locations`,
        timeoutMs: INDEX_LAG_TIMEOUT_MS,
      },
    );
  }

  /**
   * Waits until the product's pickup locations include every arranged location; creates nothing. Call it after
   * {@link PickupArrange#pickupLocations} and before checking a product's pickup options, as this list lags further
   * behind.
   *
   * @throws Error when a location is missing after 60 s.
   */
  async productPickupLocations(
    shopper: ApiSession,
    productId: string,
    arranged: ArrangedPickupLocations,
  ): Promise<void> {
    const { storeId, cultureName } = await shopper.storeContext();
    const names = arranged.locations.map(({ name }) => name);
    await pollUntil(
      async () => {
        const { productPickupLocations } = await shopper.graphql.execute(ProductPickupLocationsDocument, {
          productId,
          storeId,
          cultureName,
          keyword: arranged.namePrefix,
          first: SEARCH_PAGE_SIZE,
        });
        return productPickupLocations?.items?.map((location) => location?.name) ?? [];
      },
      (found) => names.every((name) => found.includes(name)),
      {
        describe: `${productId} to be picked up at ${arranged.namePrefix} locations`,
        timeoutMs: INDEX_LAG_TIMEOUT_MS,
      },
    );
  }
}
