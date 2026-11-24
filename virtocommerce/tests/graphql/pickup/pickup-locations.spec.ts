import type { PickupLocationSources } from "@builders/pickup-location.ts";
import type { Shopper } from "@fixtures";
import type { VirtoCommerceShippingModuleCoreModelPickupLocation as PickupLocation } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { centersStocking, findFulfillmentCenter, stockQuantity } from "@dataset/stock.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { PickupLocationsDocument, ProductPickupLocationsDocument } from "@graphql/generated/graphql.ts";
import { MODULES } from "@modules";
import { INDEX_LAG_TIMEOUT_MS } from "@support/poll.ts";
import { requireDefined } from "@support/require-fields.ts";

const STOCKED_ID = "product-sodimm-crucial-ddr4-2400-8gb";
const OUT_OF_STOCK_ID = "product-sodimm-samsung-ddr5-4800-8gb";
const IN_STOCK = { stocks: [STOCKED_ID] };
const OUT_OF_STOCK = { lacks: [STOCKED_ID] };
const PAGE_SIZE = 5;
const ALL_LOCATIONS = 100;
const KEYWORD = "Berlin";
const AVAILABILITY_ORDER: readonly (string | null | undefined)[] = ["Today", "Transfer", "GlobalTransfer"];

const QUANTITY_CASES: readonly {
  readonly title: string;
  readonly sources: () => PickupLocationSources[];
  readonly expected: () => Record<string, { availabilityType: string; availableQuantity: number }>;
}[] = [
  {
    title: "a same-day location reports the stock of its fulfillment center",
    sources: () => [
      {
        city: "Sameday",
        fulfillmentCenterId: findFulfillmentCenter(IN_STOCK),
        transferFulfillmentCenterIds: [],
      },
    ],
    expected: () => ({
      Sameday: {
        availabilityType: "Today",
        availableQuantity: stockQuantity(STOCKED_ID, findFulfillmentCenter(IN_STOCK)),
      },
    }),
  },
  {
    title: "transfer locations in several cities report the stock of their own transfer center",
    sources: () => [
      {
        city: "Denver",
        fulfillmentCenterId: null,
        transferFulfillmentCenterIds: [findFulfillmentCenter(IN_STOCK, 0)],
      },
      {
        city: "Austin",
        fulfillmentCenterId: null,
        transferFulfillmentCenterIds: [findFulfillmentCenter(IN_STOCK, 1)],
      },
    ],
    expected: () => ({
      Denver: {
        availabilityType: "Transfer",
        availableQuantity: stockQuantity(STOCKED_ID, findFulfillmentCenter(IN_STOCK, 0)),
      },
      Austin: {
        availabilityType: "Transfer",
        availableQuantity: stockQuantity(STOCKED_ID, findFulfillmentCenter(IN_STOCK, 1)),
      },
    }),
  },
  {
    title: "a location with several transfer centers reports their combined stock",
    sources: () => [
      {
        city: "Hubcity",
        fulfillmentCenterId: findFulfillmentCenter(OUT_OF_STOCK),
        transferFulfillmentCenterIds: [0, 1, 2].map((index) => findFulfillmentCenter(IN_STOCK, index)),
      },
    ],
    expected: () => ({
      Hubcity: {
        availabilityType: "Transfer",
        availableQuantity: [0, 1, 2]
          .map((index) => stockQuantity(STOCKED_ID, findFulfillmentCenter(IN_STOCK, index)))
          .reduce((sum, quantity) => sum + quantity, 0),
      },
    }),
  },
];

test.describe("pickup locations (anonymous)", () => {
  test.use({ modules: { pickup: MODULES.pickup } });

  for (const { query, read } of [
    {
      query: "pickup locations of the store",
      read: async (shopper: Shopper, first: number) => {
        const { storeId } = shopper.storeContext;
        return (await shopper.graphql.execute(PickupLocationsDocument, { storeId, first })).pickupLocations?.items;
      },
    },
    {
      query: "pickup locations of a product",
      read: async (shopper: Shopper, first: number) => {
        const { storeId, cultureName } = shopper.storeContext;
        return (
          await shopper.graphql.execute(ProductPickupLocationsDocument, {
            productId: STOCKED_ID,
            storeId,
            cultureName,
            first,
          })
        ).productPickupLocations?.items;
      },
    },
  ]) {
    test(`page through the ${query}`, async ({ shopper }) => {
      const [page, all] = await test.step(`act: get the first ${PAGE_SIZE} and then every location`, async () => [
        requireDefined(await read(shopper, PAGE_SIZE), "Pickup location"),
        requireDefined(await read(shopper, ALL_LOCATIONS), "Pickup location"),
      ]);

      await test.step("assert: the page is full, out of more locations, and every location has an address", () => {
        expect(page).toHaveLength(PAGE_SIZE);
        expect(all.length).toBeGreaterThan(PAGE_SIZE);
        for (const location of all) {
          expect(location.address).toMatchObject({ city: expect.any(String), line1: expect.any(String) });
        }
      });
    });
  }

  test("filter pickup locations by keyword", {
    annotation: {
      type: "database difference",
      description: "PostgreSQL matches names only; SQL Server and MySQL also match the address, ignoring case.",
    },
  }, async ({ shopper, dataset }) => {
    const datasetMatches = dataset.pickupLocations
      .filter((location) => location.name?.includes(KEYWORD) === true)
      .map((location) => location.name);
    const { storeId } = shopper.storeContext;

    const { pickupLocations } = await test.step(`act: search the locations for "${KEYWORD}"`, () =>
      shopper.graphql.execute(PickupLocationsDocument, { storeId, keyword: KEYWORD, first: ALL_LOCATIONS }));

    await test.step(`assert: every ${KEYWORD} location is found, and every result mentions ${KEYWORD}`, () => {
      const found = requireDefined(pickupLocations?.items, "Pickup location");
      expect(found.map((location) => location.name)).toEqual(expect.arrayContaining(datasetMatches));
      expect(
        found.filter(
          ({ name, address }) =>
            ![name, address?.city, address?.regionName, address?.line1].some((text) =>
              text?.toLowerCase().includes(KEYWORD.toLowerCase()),
            ),
        ),
      ).toEqual([]);
    });
  });
});

test.describe("pickup location administration (anonymous)", () => {
  test.use({ user: STORE_ADMINISTRATOR, modules: { pickup: MODULES.pickup } });

  test("an updated pickup location shows its new name and address", async ({ api, shopper, arrange }) => {
    const location = await test.step("arrange: pickup location in Oldtown", () =>
      arrange.pickup.pickupLocation({
        city: "Oldtown",
        fulfillmentCenterId: findFulfillmentCenter(IN_STOCK),
        transferFulfillmentCenterIds: [],
      }));
    const newAddress = { city: "Newtown", line1: "2 Updated Street", regionId: "CA", regionName: "California" };
    const changes = {
      name: `${location.name} Updated`,
      description: "Updated by an automated test",
      address: { ...location.address, ...newAddress },
    };
    const { storeId } = shopper.storeContext;

    await test.step("act: rename the location and move it to Newtown", () =>
      updatePickupLocation(api, { ...location, ...changes }));

    await test.step("assert: the frontend shows the new name, description and address", async () => {
      await expect
        .poll(
          async () =>
            (
              await shopper.graphql.execute(PickupLocationsDocument, { storeId, first: ALL_LOCATIONS })
            ).pickupLocations?.items?.find((found) => found?.id === location.id),
          { timeout: INDEX_LAG_TIMEOUT_MS },
        )
        .toMatchObject({ name: changes.name, description: changes.description, address: newAddress });
    });
  });

  test("a deactivated pickup location is hidden", async ({ api, shopper, arrange }) => {
    const location = await test.step("arrange: an active pickup location the frontend lists", () =>
      arrange.pickup.pickupLocation({
        city: "Closingtown",
        fulfillmentCenterId: findFulfillmentCenter(IN_STOCK),
        transferFulfillmentCenterIds: [],
      }));
    const { storeId } = shopper.storeContext;

    await test.step("act: deactivate the location", () => updatePickupLocation(api, { ...location, isActive: false }));

    await test.step("assert: the frontend no longer lists the location", async () => {
      await expect
        .poll(
          async () =>
            (
              await shopper.graphql.execute(PickupLocationsDocument, { storeId, first: ALL_LOCATIONS })
            ).pickupLocations?.items?.some((found) => found?.id === location.id),
          { timeout: INDEX_LAG_TIMEOUT_MS },
        )
        .toBe(false);
    });
  });
});

test.describe("product pickup locations (anonymous)", () => {
  test.use({ modules: { pickup: MODULES.pickup } });

  test("product pickup locations include every availability type", async ({ shopper, arrange }) => {
    const arranged = await test.step("arrange: same-day, transfer and global-transfer locations", () =>
      arrange.pickup.pickupLocations([
        {
          city: "Sameday",
          fulfillmentCenterId: findFulfillmentCenter(IN_STOCK),
          transferFulfillmentCenterIds: [],
        },
        {
          city: "Transferville",
          fulfillmentCenterId: findFulfillmentCenter(OUT_OF_STOCK),
          transferFulfillmentCenterIds: [findFulfillmentCenter(IN_STOCK)],
        },
        {
          city: "Globalton",
          fulfillmentCenterId: findFulfillmentCenter(OUT_OF_STOCK),
          transferFulfillmentCenterIds: [findFulfillmentCenter(OUT_OF_STOCK, 1)],
        },
      ]));
    await test.step("arrange: wait until the product can be picked up there", () =>
      arrange.pickup.productPickupLocations(shopper, STOCKED_ID, arranged));
    const { storeId, cultureName } = shopper.storeContext;

    const { productPickupLocations } = await test.step("act: get the pickup locations of the product", () =>
      shopper.graphql.execute(ProductPickupLocationsDocument, {
        productId: STOCKED_ID,
        storeId,
        cultureName,
        first: ALL_LOCATIONS,
      }));

    await test.step("assert: each location has the availability its fulfillment centers allow", () => {
      expect(arranged.byCity(productPickupLocations?.items, (location) => location.availabilityType)).toEqual({
        Sameday: "Today",
        Transferville: "Transfer",
        Globalton: "GlobalTransfer",
      });
    });
  });

  for (const { title, sources, expected } of QUANTITY_CASES) {
    test(title, async ({ shopper, arrange }) => {
      const arranged = await test.step("arrange: the locations", () => arrange.pickup.pickupLocations(sources()));
      await test.step("arrange: wait until the product can be picked up there", () =>
        arrange.pickup.productPickupLocations(shopper, STOCKED_ID, arranged));
      const { storeId, cultureName } = shopper.storeContext;

      const { productPickupLocations } = await test.step("act: get the pickup locations of the product", () =>
        shopper.graphql.execute(ProductPickupLocationsDocument, {
          productId: STOCKED_ID,
          storeId,
          cultureName,
          first: ALL_LOCATIONS,
        }));

      await test.step("assert: each location reports the expected availability and quantity", () => {
        expect(
          arranged.byCity(productPickupLocations?.items, ({ availabilityType, availableQuantity }) => ({
            availabilityType,
            availableQuantity,
          })),
        ).toEqual(expected());
      });
    });
  }

  test("a product without inventory tracking is available same-day without a quantity", async ({
    shopper,
    arrange,
  }) => {
    const product = await test.step("arrange: a product that does not track inventory", () =>
      arrange.catalog.catalogProduct({ trackInventory: false }));
    const arranged = await test.step("arrange: a location with a fulfillment center", () =>
      arrange.pickup.pickupLocations([
        {
          city: "Anytown",
          fulfillmentCenterId: findFulfillmentCenter(IN_STOCK),
          transferFulfillmentCenterIds: [],
        },
      ]));
    await test.step("arrange: wait until the product can be picked up there", () =>
      arrange.pickup.productPickupLocations(shopper, product.id, arranged));
    const { storeId, cultureName } = shopper.storeContext;

    const { productPickupLocations } = await test.step(`act: get the pickup locations of ${product.code}`, () =>
      shopper.graphql.execute(ProductPickupLocationsDocument, {
        productId: product.id,
        storeId,
        cultureName,
        first: ALL_LOCATIONS,
      }));

    await test.step("assert: the location is same-day and reports no quantity", () => {
      expect(
        arranged.byCity(productPickupLocations?.items, ({ availabilityType, availableQuantity }) => ({
          availabilityType,
          availableQuantity,
        })),
      ).toEqual({ Anytown: { availabilityType: "Today", availableQuantity: null } });
    });
  });

  test("product pickup locations list same-day first and only global transfers lack a quantity", async ({
    shopper,
    arrange,
  }) => {
    const arranged = await test.step("arrange: a same-day and a transfer location", () =>
      arrange.pickup.pickupLocations([
        {
          city: "Sameday",
          fulfillmentCenterId: findFulfillmentCenter(IN_STOCK),
          transferFulfillmentCenterIds: [],
        },
        {
          city: "Transferville",
          fulfillmentCenterId: null,
          transferFulfillmentCenterIds: [findFulfillmentCenter(IN_STOCK, 1)],
        },
      ]));
    await test.step("arrange: wait until the product can be picked up there", () =>
      arrange.pickup.productPickupLocations(shopper, STOCKED_ID, arranged));
    const { storeId, cultureName } = shopper.storeContext;

    const { productPickupLocations } = await test.step("act: get every pickup location of the product", () =>
      shopper.graphql.execute(ProductPickupLocationsDocument, {
        productId: STOCKED_ID,
        storeId,
        cultureName,
        first: ALL_LOCATIONS,
      }));
    const locations = requireDefined(productPickupLocations?.items, "Pickup location");

    await test.step("assert: same-day, then transfer, then global transfer", () => {
      const ranks = locations.map((location) => AVAILABILITY_ORDER.indexOf(location.availabilityType));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    });
    await test.step("assert: same-day and transfer locations have a quantity, global transfers do not", () => {
      for (const location of locations) {
        expect(location.availableQuantity === null, `${location.name} (${location.availabilityType})`).toBe(
          location.availabilityType === "GlobalTransfer",
        );
      }
    });
  });

  test("a product out of stock everywhere is only available via global transfer", async ({ shopper }) => {
    await test.step("arrange: the dataset stocks the product nowhere", () => {
      expect(centersStocking(OUT_OF_STOCK_ID)).toEqual([]);
    });
    const { storeId, cultureName } = shopper.storeContext;

    const { productPickupLocations } = await test.step("act: get the pickup locations of the product", () =>
      shopper.graphql.execute(ProductPickupLocationsDocument, {
        productId: OUT_OF_STOCK_ID,
        storeId,
        cultureName,
        first: ALL_LOCATIONS,
      }));

    await test.step("assert: every location is a global transfer without a quantity", () => {
      const locations = requireDefined(productPickupLocations?.items, "Pickup location");
      expect(locations.length).toBeGreaterThan(0);
      expect(locations.filter((location) => location.availabilityType !== "GlobalTransfer")).toEqual([]);
      expect(locations.filter((location) => location.availableQuantity !== null)).toEqual([]);
    });
  });
});

async function updatePickupLocation(api: HttpClient, location: PickupLocation): Promise<void> {
  (await api.put("/api/shipping/pickup-locations", { json: location })).expectOk();
}
