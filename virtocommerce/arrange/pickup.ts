import type { PickupLocationSources } from "../builders/pickup-location.ts";
import type { VirtoCommerceShippingModuleCoreModelPickupLocation as PickupLocation } from "../rest/generated/platform.ts";
import type { WithRequired } from "../support/require-fields.ts";
import type { ArrangeContext } from "./context.ts";
import type { Shopper } from "./shopper.ts";

import { GraphqlClient } from "@virtocommerce/test-automation-framework/graphql";

import { newPickupLocation } from "../builders/pickup-location.ts";
import {
  CartPickupLocationsDocument,
  PickupLocationsDocument,
  ProductPickupLocationsDocument,
} from "../graphql/generated/graphql.ts";
import { INDEX_LAG_TIMEOUT_MS, pollUntil } from "../support/poll.ts";
import { requireFields } from "../support/require-fields.ts";
import { uniqueId } from "../support/unique-id.ts";

/** A pickup location as the platform saved it. */
export type ArrangedPickupLocation = WithRequired<PickupLocation, "id" | "name">;

interface FoundPickupLocation {
  readonly name?: string | null;
  readonly address?: { readonly city?: string | null } | null;
}

/** The pickup locations of one test, which share a name prefix. */
export interface ArrangedPickupLocations {
  /** The prefix of the names of the locations, a keyword that finds only them. */
  readonly namePrefix: string;
  readonly locations: readonly ArrangedPickupLocation[];
  /**
   * Picks a value of each arranged location among found ones, by city, ignoring other locations.
   *
   * @example
   * expect(arranged.byCity(found, (location) => location.availabilityType)).toEqual({ Sameday: "Today" });
   */
  byCity<Found extends FoundPickupLocation, Value>(
    found: readonly (Found | null)[] | null | undefined,
    pick: (location: Found) => Value,
  ): Record<string, Value>;
}

/** Arranges pickup locations of the store under test. */
export interface PickupArrange {
  /**
   * Creates active pickup locations of the store, deletes them after the test, and waits until xAPI finds them.
   *
   * @throws {Error} xAPI does not find the locations in time.
   */
  pickupLocations(sources: readonly PickupLocationSources[]): Promise<ArrangedPickupLocations>;
  /** Creates one active pickup location, as {@link PickupArrange#pickupLocations} does. */
  pickupLocation(source: PickupLocationSources): Promise<ArrangedPickupLocation>;
  /** Waits until xAPI offers the arranged locations for picking up a cart of the shopper. */
  cartPickupLocations(shopper: Shopper, cartId: string, arranged: ArrangedPickupLocations): Promise<void>;
  /** Waits until xAPI offers the arranged locations for picking up a product. */
  productPickupLocations(shopper: Shopper, productId: string, arranged: ArrangedPickupLocations): Promise<void>;
}

const PICKUP_LOCATIONS_PATH = "/api/shipping/pickup-locations";
const SEARCH_PAGE_SIZE = 100;

/**
 * Returns the pickup location methods of `arrange`.
 *
 * @param context - What the methods create and remove data with.
 * @returns The methods.
 */
export function pickupArrange({ admin, store, later }: ArrangeContext): PickupArrange {
  async function pickupLocations(sources: readonly PickupLocationSources[]): Promise<ArrangedPickupLocations> {
    const client = await admin();
    const namePrefix = uniqueId("test-pickup");
    const locations: ArrangedPickupLocation[] = [];
    for (const source of sources) {
      const draft = newPickupLocation(store.id, namePrefix, source);
      const created = (await client.post(PICKUP_LOCATIONS_PATH, { json: draft })).expectOk().json<PickupLocation>();
      const location = requireFields(created, ["id", "name"], `Pickup location ${draft.name}`);
      later(`delete pickup location ${location.name}`, async () =>
        (
          await client.delete(
            `${PICKUP_LOCATIONS_PATH}/${encodeURIComponent(store.id)}/${encodeURIComponent(location.id)}`,
          )
        ).expectOk(),
      );
      locations.push(location);
    }
    const graphql = new GraphqlClient(client);
    await waitForNames(
      locations,
      async () =>
        (
          await graphql.execute(PickupLocationsDocument, {
            storeId: store.id,
            keyword: namePrefix,
            first: SEARCH_PAGE_SIZE,
          })
        ).pickupLocations?.items,
      `pickup locations ${namePrefix} to be searchable`,
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

  async function pickupLocation(source: PickupLocationSources): Promise<ArrangedPickupLocation> {
    const { locations } = await pickupLocations([source]);
    return requireFields(locations[0], ["id", "name"], `Pickup location in ${source.city}`);
  }

  async function cartPickupLocations(
    shopper: Shopper,
    cartId: string,
    arranged: ArrangedPickupLocations,
  ): Promise<void> {
    const { storeId, cultureName } = shopper.storeContext;
    await waitForNames(
      arranged.locations,
      async () =>
        (
          await shopper.graphql.execute(CartPickupLocationsDocument, {
            cartId,
            storeId,
            cultureName,
            keyword: arranged.namePrefix,
            first: SEARCH_PAGE_SIZE,
          })
        ).cartPickupLocations?.items,
      `cart ${cartId} to be picked up at ${arranged.namePrefix} locations`,
    );
  }

  async function productPickupLocations(
    shopper: Shopper,
    productId: string,
    arranged: ArrangedPickupLocations,
  ): Promise<void> {
    const { storeId, cultureName } = shopper.storeContext;
    await waitForNames(
      arranged.locations,
      async () =>
        (
          await shopper.graphql.execute(ProductPickupLocationsDocument, {
            productId,
            storeId,
            cultureName,
            keyword: arranged.namePrefix,
            first: SEARCH_PAGE_SIZE,
          })
        ).productPickupLocations?.items,
      `${productId} to be picked up at ${arranged.namePrefix} locations`,
    );
  }

  return { pickupLocations, pickupLocation, cartPickupLocations, productPickupLocations };
}

async function waitForNames(
  locations: readonly ArrangedPickupLocation[],
  find: () => Promise<readonly ({ readonly name?: string | null } | null)[] | null | undefined>,
  describe: string,
): Promise<void> {
  const names = locations.map(({ name }) => name);
  await pollUntil(
    async () => (await find())?.map((location) => location?.name) ?? [],
    (found) => names.every((name) => found.includes(name)),
    describe,
    INDEX_LAG_TIMEOUT_MS,
  );
}
