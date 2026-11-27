import type { Arrange, ArrangedPickupLocations, Shopper } from "@arrange";
import type { Frontend } from "@pages/frontend/frontend.ts";

import { findFulfillmentCenter } from "@dataset/stock.ts";
import { expect, test } from "@fixtures";
import { MODULES } from "@modules";

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

test.describe("checkout delivery (anonymous)", () => {
  test.beforeEach(async ({ shopper, arrange }) => {
    await test.step("arrange: a cart", () => arrange.carts.cart(shopper, ITEMS));
  });

  test("switch between shipping methods", async ({ frontend }) => {
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
  test.use({ modules: { pickup: MODULES.pickup } });

  test.beforeEach(async ({ shopper, arrange }) => {
    await test.step("arrange: a cart", () => arrange.carts.cart(shopper, ITEMS));
  });

  test("switch between shipping and pickup", async ({ frontend }) => {
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

test.describe("checkout pickup locations (anonymous, with a new location)", () => {
  test.use({ modules: { pickup: MODULES.pickup } });

  test("filter pickup locations by country, region and city", async ({ frontend, shopper, arrange }) => {
    const location = await openPickupLocations(frontend, shopper, arrange);
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

  test("search pickup locations by keyword", async ({ frontend, shopper, arrange }) => {
    const location = await openPickupLocations(frontend, shopper, arrange);
    const modal = frontend.pickupLocationsModal;

    await test.step(`act: search for "${location.namePrefix}"`, () => modal.filters.search(location.namePrefix));

    await test.step("assert: only the new location is listed", async () => {
      await expect(modal.cards).toHaveCount(1);
      await expect(modal.cardsWhere({ name: `${location.namePrefix} ${LOCATION.city}` })).toHaveCount(1);
    });
  });

  test("a keyword without matches lists no pickup locations", async ({ frontend, shopper, arrange }) => {
    await openPickupLocations(frontend, shopper, arrange);
    const modal = frontend.pickupLocationsModal;

    await test.step(`act: search for "${NO_MATCH_KEYWORD}"`, () => modal.filters.search(NO_MATCH_KEYWORD));

    await test.step("assert: no pickup location is listed", async () => {
      await expect(modal.cards).toHaveCount(0);
    });
  });
});

async function openPickupLocations(
  frontend: Frontend,
  shopper: Shopper,
  arrange: Arrange,
): Promise<ArrangedPickupLocations> {
  const { id: cartId } = await test.step("arrange: a cart", () => arrange.carts.cart(shopper, ITEMS));
  const location = await test.step(`arrange: a pickup location in ${LOCATION.city}, ${LOCATION.regionId}`, () =>
    arrange.pickup.pickupLocations([
      {
        city: LOCATION.city,
        fulfillmentCenterId: findFulfillmentCenter({ stocks: [PRODUCT_ID] }),
        transferFulfillmentCenterIds: [],
        address: { countryName: LOCATION.countryName, regionId: LOCATION.regionId, regionName: LOCATION.regionName },
      },
    ]));
  await test.step("arrange: wait until the cart can be picked up there", () =>
    arrange.pickup.cartPickupLocations(shopper, cartId, location));
  const flow = frontend.checkout();
  await test.step(`arrange: open the pickup locations on the ${flow.mode} checkout`, async () => {
    await flow.start();
    await flow.shippingDetails.pickupSwitcher.click();
    await flow.shippingDetails.pickupLocationButton.click();
    await expect(frontend.pickupLocationsModal.cards.first()).toBeVisible();
  });
  return location;
}
