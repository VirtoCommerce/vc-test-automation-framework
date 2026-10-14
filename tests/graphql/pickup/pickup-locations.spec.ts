import type { ApiSession } from "@api/api-session";
import type { PickupLocationSources } from "@dataset/builders/pickup-location";
import type { Dataset } from "@dataset/dataset";

import * as allure from "allure-js-commons";

import { PickupLocationsDocument, ProductPickupLocationsDocument } from "@api/graphql/generated/graphql";
import { INDEX_LAG_TIMEOUT_MS } from "@core/poll";
import { requireDefined } from "@core/required-fields";
import { centersStocking, findFulfillmentCenter, stockQuantity } from "@dataset/stock";
import { expect, test } from "@fixtures";

const PICKUP_MODULE = "VirtoCommerce.XPickup";
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
  readonly sources: (dataset: Dataset) => PickupLocationSources[];
  readonly expected: (dataset: Dataset) => Record<string, { availabilityType: string; availableQuantity: number }>;
}[] = [
  {
    title: "a same-day location reports the stock of its fulfillment center",
    sources: (dataset) => [
      {
        city: "Sameday",
        fulfillmentCenterId: findFulfillmentCenter(dataset, IN_STOCK),
        transferFulfillmentCenterIds: [],
      },
    ],
    expected: (dataset) => ({
      Sameday: {
        availabilityType: "Today",
        availableQuantity: stockQuantity(dataset, STOCKED_ID, findFulfillmentCenter(dataset, IN_STOCK)),
      },
    }),
  },
  {
    title: "transfer locations in several cities report the stock of their own transfer center",
    sources: (dataset) => [
      {
        city: "Denver",
        fulfillmentCenterId: null,
        transferFulfillmentCenterIds: [findFulfillmentCenter(dataset, IN_STOCK, 0)],
      },
      {
        city: "Austin",
        fulfillmentCenterId: null,
        transferFulfillmentCenterIds: [findFulfillmentCenter(dataset, IN_STOCK, 1)],
      },
    ],
    expected: (dataset) => ({
      Denver: {
        availabilityType: "Transfer",
        availableQuantity: stockQuantity(dataset, STOCKED_ID, findFulfillmentCenter(dataset, IN_STOCK, 0)),
      },
      Austin: {
        availabilityType: "Transfer",
        availableQuantity: stockQuantity(dataset, STOCKED_ID, findFulfillmentCenter(dataset, IN_STOCK, 1)),
      },
    }),
  },
  {
    title: "a location with several transfer centers reports their combined stock",
    sources: (dataset) => [
      {
        city: "Hubcity",
        fulfillmentCenterId: findFulfillmentCenter(dataset, OUT_OF_STOCK),
        transferFulfillmentCenterIds: [0, 1, 2].map((index) => findFulfillmentCenter(dataset, IN_STOCK, index)),
      },
    ],
    expected: (dataset) => ({
      Hubcity: {
        availabilityType: "Transfer",
        availableQuantity: [0, 1, 2]
          .map((index) => stockQuantity(dataset, STOCKED_ID, findFulfillmentCenter(dataset, IN_STOCK, index)))
          .reduce((sum, quantity) => sum + quantity, 0),
      },
    }),
  },
];

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Pickup / Pickup Locations");
});

test.describe("pickup locations (anonymous)", () => {
  test.use({ requiresModules: [PICKUP_MODULE] });

  for (const { query, read } of [
    {
      query: "pickup locations of the store",
      read: async (api: ApiSession, first: number) => {
        const { storeId } = await api.storeContext();
        return (await api.graphql.execute(PickupLocationsDocument, { storeId, first })).pickupLocations?.items;
      },
    },
    {
      query: "pickup locations of a product",
      read: async (api: ApiSession, first: number) => {
        const { storeId, cultureName } = await api.storeContext();
        return (
          await api.graphql.execute(ProductPickupLocationsDocument, {
            productId: STOCKED_ID,
            storeId,
            cultureName,
            first,
          })
        ).productPickupLocations?.items;
      },
    },
  ]) {
    test(`page through the ${query}`, async ({ api }) => {
      await allure.story("Paging");
      await allure.description(
        `The first ${PAGE_SIZE} of more ${query} come back as one full page, each with an address.`,
      );

      const [page, all] = await test.step(`act: get the first ${PAGE_SIZE} and then every location`, async () => [
        requireDefined(await read(api, PAGE_SIZE), "Pickup location"),
        requireDefined(await read(api, ALL_LOCATIONS), "Pickup location"),
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
  }, async ({ api, dataset }) => {
    await allure.story("Search");
    await allure.description(
      `Searching "${KEYWORD}" finds every dataset location named with ${KEYWORD}, and every result mentions ` +
        `${KEYWORD} in its name or address: PostgreSQL matches names only, SQL Server and MySQL also the address.`,
    );
    const datasetMatches = dataset.pickupLocations
      .filter((location) => location.name?.includes(KEYWORD) === true)
      .map((location) => location.name);
    const { storeId } = await api.storeContext();

    const { pickupLocations } = await test.step(`act: search the locations for "${KEYWORD}"`, () =>
      api.graphql.execute(PickupLocationsDocument, { storeId, keyword: KEYWORD, first: ALL_LOCATIONS }));

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
  test.use({ requiresModules: [PICKUP_MODULE] });

  test("an updated pickup location shows its new name and address", async ({ api, arrange, dataset }) => {
    await allure.story("Administration");
    await allure.description(
      "A location renamed and moved by the administrator shows its new details on the frontend.",
    );
    const location = await test.step("arrange: pickup location in Oldtown", () =>
      arrange.pickup.pickupLocation({
        city: "Oldtown",
        fulfillmentCenterId: findFulfillmentCenter(dataset, IN_STOCK),
        transferFulfillmentCenterIds: [],
      }));
    const newAddress = { city: "Newtown", line1: "2 Updated Street", regionId: "CA", regionName: "California" };
    const changes = {
      name: `${location.name} Updated`,
      description: "Updated by an automated test",
      address: { ...location.address, ...newAddress },
    };
    const { storeId } = await api.storeContext();

    await test.step("act: rename the location and move it to Newtown", () =>
      arrange.admin.rest.pickupLocations.update({ ...location, ...changes }));

    await test.step("assert: the frontend shows the new name, description and address", async () => {
      await expect
        .poll(
          async () =>
            (
              await api.graphql.execute(PickupLocationsDocument, { storeId, first: ALL_LOCATIONS })
            ).pickupLocations?.items?.find((found) => found?.id === location.id),
          { timeout: INDEX_LAG_TIMEOUT_MS },
        )
        .toMatchObject({ name: changes.name, description: changes.description, address: newAddress });
    });
  });

  test("a deactivated pickup location is hidden", async ({ api, arrange, dataset }) => {
    await allure.story("Administration");
    await allure.description("A location the administrator deactivates disappears from the frontend.");
    const location = await test.step("arrange: an active pickup location the frontend lists", () =>
      arrange.pickup.pickupLocation({
        city: "Closingtown",
        fulfillmentCenterId: findFulfillmentCenter(dataset, IN_STOCK),
        transferFulfillmentCenterIds: [],
      }));
    const { storeId } = await api.storeContext();

    await test.step("act: deactivate the location", () =>
      arrange.admin.rest.pickupLocations.update({ ...location, isActive: false }));

    await test.step("assert: the frontend no longer lists the location", async () => {
      await expect
        .poll(
          async () =>
            (
              await api.graphql.execute(PickupLocationsDocument, { storeId, first: ALL_LOCATIONS })
            ).pickupLocations?.items?.some((found) => found?.id === location.id),
          { timeout: INDEX_LAG_TIMEOUT_MS },
        )
        .toBe(false);
    });
  });
});

test.describe("product pickup locations (anonymous)", () => {
  test.use({ requiresModules: [PICKUP_MODULE] });

  test("product pickup locations include every availability type", async ({ api, arrange, dataset }) => {
    await allure.story("Availability");
    await allure.description(
      "A location is same-day when its own center stocks the product, a transfer when a transfer center does, " +
        "and a global transfer when neither does.",
    );
    const arranged = await test.step("arrange: same-day, transfer and global-transfer locations", () =>
      arrange.pickup.pickupLocations([
        {
          city: "Sameday",
          fulfillmentCenterId: findFulfillmentCenter(dataset, IN_STOCK),
          transferFulfillmentCenterIds: [],
        },
        {
          city: "Transferville",
          fulfillmentCenterId: findFulfillmentCenter(dataset, OUT_OF_STOCK),
          transferFulfillmentCenterIds: [findFulfillmentCenter(dataset, IN_STOCK)],
        },
        {
          city: "Globalton",
          fulfillmentCenterId: findFulfillmentCenter(dataset, OUT_OF_STOCK),
          transferFulfillmentCenterIds: [findFulfillmentCenter(dataset, OUT_OF_STOCK, 1)],
        },
      ]));
    await test.step("arrange: wait until the product can be picked up there", () =>
      arrange.pickup.productPickupLocations(api, STOCKED_ID, arranged));
    const { storeId, cultureName } = await api.storeContext();

    const { productPickupLocations } = await test.step("act: get the pickup locations of the product", () =>
      api.graphql.execute(ProductPickupLocationsDocument, {
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
    test(title, async ({ api, arrange, dataset }) => {
      await allure.story("Quantity");
      await allure.description(`Pickup quantities: ${title}.`);
      const arranged = await test.step("arrange: the locations", () =>
        arrange.pickup.pickupLocations(sources(dataset)));
      await test.step("arrange: wait until the product can be picked up there", () =>
        arrange.pickup.productPickupLocations(api, STOCKED_ID, arranged));
      const { storeId, cultureName } = await api.storeContext();

      const { productPickupLocations } = await test.step("act: get the pickup locations of the product", () =>
        api.graphql.execute(ProductPickupLocationsDocument, {
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
        ).toEqual(expected(dataset));
      });
    });
  }

  test("a product without inventory tracking is available same-day without a quantity", async ({
    api,
    arrange,
    dataset,
  }) => {
    await allure.story("Availability");
    await allure.description(
      "A product that does not track inventory is same-day at a location with a fulfillment center, " +
        "with no quantity reported.",
    );
    const product = await test.step("arrange: a product that does not track inventory", () =>
      arrange.catalog.catalogProduct({ trackInventory: false }));
    const arranged = await test.step("arrange: a location with a fulfillment center", () =>
      arrange.pickup.pickupLocations([
        {
          city: "Anytown",
          fulfillmentCenterId: findFulfillmentCenter(dataset, IN_STOCK),
          transferFulfillmentCenterIds: [],
        },
      ]));
    await test.step("arrange: wait until the product can be picked up there", () =>
      arrange.pickup.productPickupLocations(api, product.id, arranged));
    const { storeId, cultureName } = await api.storeContext();

    const { productPickupLocations } = await test.step(`act: get the pickup locations of ${product.code}`, () =>
      api.graphql.execute(ProductPickupLocationsDocument, {
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
    api,
    arrange,
    dataset,
  }) => {
    await allure.story("Order");
    await allure.description(
      "Locations come same-day first, then transfers, then global transfers; only global transfers have no quantity.",
    );
    const arranged = await test.step("arrange: a same-day and a transfer location", () =>
      arrange.pickup.pickupLocations([
        {
          city: "Sameday",
          fulfillmentCenterId: findFulfillmentCenter(dataset, IN_STOCK),
          transferFulfillmentCenterIds: [],
        },
        {
          city: "Transferville",
          fulfillmentCenterId: null,
          transferFulfillmentCenterIds: [findFulfillmentCenter(dataset, IN_STOCK, 1)],
        },
      ]));
    await test.step("arrange: wait until the product can be picked up there", () =>
      arrange.pickup.productPickupLocations(api, STOCKED_ID, arranged));
    const { storeId, cultureName } = await api.storeContext();

    const { productPickupLocations } = await test.step("act: get every pickup location of the product", () =>
      api.graphql.execute(ProductPickupLocationsDocument, {
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

  test("a product out of stock everywhere is only available via global transfer", async ({ api, dataset }) => {
    await allure.story("Availability");
    await allure.description(
      "A product no fulfillment center stocks is a global transfer everywhere, with no quantity.",
    );
    await test.step("arrange: the dataset stocks the product nowhere", () => {
      expect(centersStocking(dataset, OUT_OF_STOCK_ID)).toEqual([]);
    });
    const { storeId, cultureName } = await api.storeContext();

    const { productPickupLocations } = await test.step("act: get the pickup locations of the product", () =>
      api.graphql.execute(ProductPickupLocationsDocument, {
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
