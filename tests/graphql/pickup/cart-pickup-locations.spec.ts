import * as allure from "allure-js-commons";

import { CartPickupLocationsDocument } from "@api/graphql/generated/graphql";
import { findFulfillmentCenter } from "@dataset/stock";
import { expect, test } from "@fixtures";

const MEMORY_ID = "product-sodimm-crucial-ddr4-2400-8gb";
const PHONE_ID = "product-smartphone-apple-iphone-17-256gb-black";
const ALL_LOCATIONS = 100;

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Pickup / Cart Pickup Locations");
});

test.describe("cart pickup locations (anonymous)", () => {
  test("cart pickup locations of a product missing at the same-day center are transfers", async ({
    api,
    arrange,
    dataset,
  }) => {
    await allure.story("Availability");
    await allure.description(
      "A location whose own center lacks the product is a transfer when a transfer center stocks it, " +
        "and a global transfer when none does.",
    );
    const arranged = await test.step("arrange: locations whose same-day center lacks the product", () =>
      arrange.pickup.pickupLocations([
        {
          city: "Transferville",
          fulfillmentCenterId: findFulfillmentCenter(dataset, { lacks: [MEMORY_ID] }),
          transferFulfillmentCenterIds: [findFulfillmentCenter(dataset, { stocks: [MEMORY_ID] })],
        },
        {
          city: "Globalton",
          fulfillmentCenterId: findFulfillmentCenter(dataset, { lacks: [MEMORY_ID] }),
          transferFulfillmentCenterIds: [findFulfillmentCenter(dataset, { lacks: [MEMORY_ID] }, 1)],
        },
      ]));
    const cart = await test.step("arrange: cart with the memory module", () =>
      arrange.carts.cart(api, [{ productId: MEMORY_ID, quantity: 1 }]));
    await test.step("arrange: wait until the cart can be picked up there", () =>
      arrange.pickup.cartPickupLocations(api, cart.id, arranged));
    const { storeId, cultureName } = await api.storeContext();

    const { cartPickupLocations } = await test.step("act: get the cart pickup locations", () =>
      api.graphql.execute(CartPickupLocationsDocument, {
        cartId: cart.id,
        storeId,
        cultureName,
        first: ALL_LOCATIONS,
      }));

    await test.step("assert: the locations are a transfer and a global transfer", () => {
      expect(arranged.byCity(cartPickupLocations?.items, (location) => location.availabilityType)).toEqual({
        Transferville: "Transfer",
        Globalton: "GlobalTransfer",
      });
    });
  });

  test("cart pickup locations of an in-stock product list same-day locations first", async ({
    api,
    arrange,
    dataset,
  }) => {
    await allure.story("Order");
    await allure.description("Same-day locations come before every other availability type.");
    const arranged = await test.step("arrange: a same-day and a transfer location", () =>
      arrange.pickup.pickupLocations([
        {
          city: "Transferville",
          fulfillmentCenterId: null,
          transferFulfillmentCenterIds: [findFulfillmentCenter(dataset, { stocks: [MEMORY_ID] })],
        },
        {
          city: "Sameday",
          fulfillmentCenterId: findFulfillmentCenter(dataset, { stocks: [MEMORY_ID] }),
          transferFulfillmentCenterIds: [],
        },
      ]));
    const cart = await test.step("arrange: cart with the memory module", () =>
      arrange.carts.cart(api, [{ productId: MEMORY_ID, quantity: 1 }]));
    await test.step("arrange: wait until the cart can be picked up there", () =>
      arrange.pickup.cartPickupLocations(api, cart.id, arranged));
    const { storeId, cultureName } = await api.storeContext();

    const { cartPickupLocations } = await test.step("act: get every cart pickup location", () =>
      api.graphql.execute(CartPickupLocationsDocument, {
        cartId: cart.id,
        storeId,
        cultureName,
        first: ALL_LOCATIONS,
      }));

    await test.step("assert: the arranged same-day location is same-day", () => {
      expect(arranged.byCity(cartPickupLocations?.items, (location) => location.availabilityType)).toMatchObject({
        Sameday: "Today",
      });
    });
    await test.step("assert: no same-day location follows another availability type", () => {
      const types = cartPickupLocations?.items?.map((location) => location?.availabilityType) ?? [];
      const firstOther = types.findIndex((type) => type !== "Today");
      expect(firstOther).toBeGreaterThan(0);
      expect(types.slice(firstOther)).not.toContain("Today");
    });
  });

  test("cart pickup locations of mixed products are same-day only where every product is stocked", async ({
    api,
    arrange,
    dataset,
  }) => {
    await allure.story("Availability");
    await allure.description(
      "A location is same-day for a cart only when its center stocks every product; a missing product makes it " +
        "a transfer when a transfer center has it, and a global transfer otherwise.",
    );
    const memoryOnlyCenter = findFulfillmentCenter(dataset, { stocks: [MEMORY_ID], lacks: [PHONE_ID] });
    const arranged = await test.step("arrange: locations stocking both, one, or one plus a transfer of the other", () =>
      arrange.pickup.pickupLocations([
        {
          city: "Bothstock",
          fulfillmentCenterId: findFulfillmentCenter(dataset, { stocks: [MEMORY_ID, PHONE_ID] }),
          transferFulfillmentCenterIds: [],
        },
        { city: "Halfstock", fulfillmentCenterId: memoryOnlyCenter, transferFulfillmentCenterIds: [] },
        {
          city: "Halftransfer",
          fulfillmentCenterId: memoryOnlyCenter,
          transferFulfillmentCenterIds: [findFulfillmentCenter(dataset, { stocks: [PHONE_ID], lacks: [MEMORY_ID] })],
        },
      ]));
    const cart = await test.step("arrange: cart with the memory module and the phone", () =>
      arrange.carts.cart(api, [
        { productId: MEMORY_ID, quantity: 1 },
        { productId: PHONE_ID, quantity: 1 },
      ]));
    await test.step("arrange: wait until the cart can be picked up there", () =>
      arrange.pickup.cartPickupLocations(api, cart.id, arranged));
    const { storeId, cultureName } = await api.storeContext();

    const { cartPickupLocations } = await test.step("act: get the cart pickup locations", () =>
      api.graphql.execute(CartPickupLocationsDocument, {
        cartId: cart.id,
        storeId,
        cultureName,
        first: ALL_LOCATIONS,
      }));

    await test.step("assert: a location missing a product is never same-day", () => {
      expect(arranged.byCity(cartPickupLocations?.items, (location) => location.availabilityType)).toEqual({
        Bothstock: "Today",
        Halfstock: "GlobalTransfer",
        Halftransfer: "Transfer",
      });
    });
  });
});
