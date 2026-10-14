import type { ArrangedPickupLocations } from "@dataset/arrange";

import * as allure from "allure-js-commons";

import { MODULES } from "@dataset/modules";
import { findFulfillmentCenter } from "@dataset/stock";
import { expect, test } from "@fixtures";

const PRODUCT_ID = "product-smartphone-google-pixel-10-lemongrass";
const ITEMS = [{ productId: PRODUCT_ID, quantity: 3 }] as const;
const SHIPPING_METHODS = ["FixedRate_Ground", "FixedRate_Air"] as const;
const LOCATION = {
  countryName: "United States of America",
  regionId: "DC",
  regionName: "District of Columbia",
  city: "Washington",
} as const;
const LOCATION_FILTER = { country: LOCATION.countryName, region: LOCATION.regionName, city: LOCATION.city } as const;
const NO_MATCH_KEYWORD = "NonExistentLocation12345";

const pickupTest = test.extend<{ readonly location: ArrangedPickupLocations }>({
  location: async ({ shopper, arrange, dataset }, use) => {
    const { id: cartId } = await test.step("arrange: a cart", () => arrange.carts.defaultCart(shopper.api, ITEMS));
    const location = await test.step(`arrange: a pickup location in ${LOCATION.city}, ${LOCATION.regionId}`, () =>
      arrange.pickup.pickupLocations([
        {
          city: LOCATION.city,
          fulfillmentCenterId: findFulfillmentCenter(dataset, { stocks: [PRODUCT_ID] }),
          transferFulfillmentCenterIds: [],
          address: { countryName: LOCATION.countryName, regionId: LOCATION.regionId, regionName: LOCATION.regionName },
        },
      ]));
    await test.step("arrange: wait until the cart can be picked up there", () =>
      arrange.pickup.cartPickupLocations(shopper.api, cartId, location));
    await use(location);
  },
});

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Checkout");
});

test.describe("checkout delivery (anonymous)", () => {
  test.beforeEach(async ({ shopper, arrange }) => {
    await test.step("arrange: a cart", () => arrange.carts.defaultCart(shopper.api, ITEMS));
  });

  test("switch between shipping methods", async ({ frontend }) => {
    await allure.story("Shipping method");
    await allure.description(`Each of ${SHIPPING_METHODS.join(" and ")} can be selected in turn.`);
    const flow = frontend.checkout();
    const { shippingDetails } = flow;

    await test.step(`arrange: open the ${flow.mode} checkout with shipping`, async () => {
      await flow.start();
      await shippingDetails.shippingSwitcher.click();
    });

    for (const code of SHIPPING_METHODS) {
      await test.step(`act: select ${code}`, () => shippingDetails.selectShippingMethod(code));
      await test.step(`assert: ${code} is selected`, async () => {
        await expect(shippingDetails.selectedShippingMethod(code)).toBeVisible();
      });
    }
  });
});

test.describe("checkout delivery with pickup (anonymous)", () => {
  test.use({ requiresModules: [MODULES.pickup] });

  test.beforeEach(async ({ shopper, arrange }) => {
    await test.step("arrange: a cart", () => arrange.carts.defaultCart(shopper.api, ITEMS));
  });

  test("switch between shipping and pickup", async ({ frontend }) => {
    await allure.story("Delivery option");
    await allure.description("The delivery switches show the shipping address or the pickup location section.");
    const flow = frontend.checkout();
    const { shippingDetails } = flow;
    await test.step(`arrange: open the ${flow.mode} checkout`, () => flow.start());

    await test.step("act: choose shipping", () => shippingDetails.shippingSwitcher.click());
    await test.step("assert: the shipping address section is shown", async () => {
      await expect(shippingDetails.shippingAddressSection).toBeVisible();
    });

    await test.step("act: choose pickup", () => shippingDetails.pickupSwitcher.click());
    await test.step("assert: the pickup location section is shown", async () => {
      await expect(shippingDetails.pickupLocationSection).toBeVisible();
      await expect(shippingDetails.shippingAddressSection).toBeHidden();
    });
  });
});

pickupTest.describe("checkout pickup locations (anonymous, with a new location)", () => {
  pickupTest.use({ requiresModules: [MODULES.pickup] });

  pickupTest.beforeEach(async ({ frontend, location }) => {
    const flow = frontend.checkout();
    await test.step(`arrange: open the pickup locations on the ${flow.mode} checkout`, async () => {
      await flow.start();
      await flow.shippingDetails.pickupSwitcher.click();
      await flow.shippingDetails.pickupLocationButton.click();
      await expect(frontend.pickupLocationsModal.cards.first()).toBeVisible();
    });
    await allure.parameter("location", location.namePrefix);
  });

  pickupTest("filter pickup locations by country, region and city", async ({ frontend, location }) => {
    await allure.story("Pickup location");
    await allure.description(
      `A new location in ${LOCATION.city} is listed when the locations are filtered by its country, region and city.`,
    );
    const modal = frontend.pickupLocationsModal;

    await test.step(`act: filter by ${Object.values(LOCATION_FILTER).join(", ")}`, () =>
      modal.filters.apply(LOCATION_FILTER));

    await test.step(`assert: the new ${LOCATION.city} location is listed`, async () => {
      await expect(
        modal.cardsWhere({
          country: LOCATION.countryName,
          region: LOCATION.regionId,
          city: LOCATION.city,
          name: `${location.namePrefix} ${LOCATION.city}`,
        }),
      ).toHaveCount(1);
    });
  });

  pickupTest("search pickup locations by keyword", async ({ frontend, location }) => {
    await allure.story("Pickup location");
    await allure.description("A keyword only the new location has lists exactly that location.");
    const modal = frontend.pickupLocationsModal;

    await test.step(`act: search for "${location.namePrefix}"`, () => modal.filters.search(location.namePrefix));

    await test.step("assert: only the new location is listed", async () => {
      await expect(modal.cards).toHaveCount(1);
      await expect(modal.cardsWhere({ name: `${location.namePrefix} ${LOCATION.city}` })).toHaveCount(1);
    });
  });

  pickupTest("a keyword without matches lists no pickup locations", async ({ frontend }) => {
    await allure.story("Pickup location");
    await allure.description("A keyword no location has lists no pickup locations.");
    const modal = frontend.pickupLocationsModal;

    await test.step(`act: search for "${NO_MATCH_KEYWORD}"`, () => modal.filters.search(NO_MATCH_KEYWORD));

    await test.step("assert: no pickup location is listed", async () => {
      await expect(modal.cards).toHaveCount(0);
    });
  });
});
