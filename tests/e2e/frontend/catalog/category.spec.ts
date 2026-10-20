import * as allure from "allure-js-commons";

import { ProductsDocument } from "@api/graphql/generated/graphql";
import { requireDefined } from "@core/required-fields";
import { expect, test } from "@fixtures";
import { ProductPage } from "@pages/frontend/pages/catalog/product-page";

const SMARTPHONES = { id: "category-acme-electronics-smartphones", path: "smartphones" } as const;
const LAPTOPS = "laptops";
const PRODUCT_SKU = "smartphone-samsung-galaxy-a57-5g";
const CONFIGURABLE = {
  sku: "laptop-acer-predator-helios-neo-16-ai",
  slug: "acer-predator-helios-neo-16-ai",
  path: "laptops/acer-predator-helios-neo-16-ai",
} as const;
const FAMILY_SKU = "smartphone-google-pixel-10-frost";
const [FIRST_VARIATION, SECOND_VARIATION] = [
  "smartphone-google-pixel-10-indigo",
  "smartphone-google-pixel-10-lemongrass",
] as const;
const PRICE_RANGE = { from: 1000, to: 2000 } as const;
const NARROW_VIEWPORT = { width: 800, height: 600 } as const;
const PAGE_SIZE = 100;
const CARD_QUANTITIES = [
  { quantity: 1, badge: "1" },
  { quantity: 2, badge: "2" },
  { quantity: 1, badge: "1" },
] as const;
const VARIATION_QUANTITIES = [
  { sku: FIRST_VARIATION, quantity: 1, badge: "1" },
  { sku: FIRST_VARIATION, quantity: 2, badge: "2" },
  { sku: SECOND_VARIATION, quantity: 1, badge: "3" },
  { sku: SECOND_VARIATION, quantity: 2, badge: "4" },
  { sku: FIRST_VARIATION, quantity: 1, badge: "3" },
  { sku: SECOND_VARIATION, quantity: 1, badge: "2" },
] as const;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Catalog");
});

test.describe("category page (anonymous)", () => {
  test("switch between grid and list views", async ({ frontend }) => {
    await allure.story("Category");
    await allure.description("The view switcher shows a category's products as a grid or as a list.");
    const category = frontend.category(SMARTPHONES.path);
    await test.step(`arrange: open ${SMARTPHONES.path}`, () => category.navigate());

    await test.step("act: switch to the grid view", () => category.gridViewTab.click());
    await test.step("assert: the products are a grid", async () => {
      await expect(category.gridView).toBeVisible();
    });

    await test.step("act: switch to the list view", () => category.listViewTab.click());
    await test.step("assert: the products are a list", async () => {
      await expect(category.listView).toBeVisible();
      await expect(category.gridView).toBeHidden();
    });
  });

  test("filter products by price", async ({ frontend, api, store }) => {
    await allure.story("Filters");
    await allure.description(
      `The price filter, whichever control the frontend renders, narrows ${SMARTPHONES.path} to the products ` +
        `the catalog prices between ${PRICE_RANGE.from} and ${PRICE_RANGE.to}.`,
    );
    const category = frontend.category(SMARTPHONES.path);
    const context = await api.storeContext();
    const { products } = await test.step("arrange: the category's products in the price range", () =>
      api.graphql.execute(ProductsDocument, {
        ...context,
        filter: `category.subtree:${store.catalog}/${SMARTPHONES.id} price.${context.currencyCode}:[${PRICE_RANGE.from} TO ${PRICE_RANGE.to}]`,
        first: PAGE_SIZE,
      }));
    const inRange = requireDefined(products?.items, "Product in range").length;

    await test.step(`arrange: open ${SMARTPHONES.path}`, async () => {
      await category.navigate();
      await expect(category.productsCountLabel).not.toHaveText(String(inRange));
    });

    await test.step(`act: filter by price ${PRICE_RANGE.from}–${PRICE_RANGE.to}`, () =>
      category.priceFilter.apply(PRICE_RANGE.from, PRICE_RANGE.to));

    await test.step(`assert: ${inRange} products are shown`, async () => {
      await expect(category.productsCountLabel).toHaveText(String(inRange));
    });
  });

  test("the quantity control stays usable in a narrow viewport", async ({ frontend, page }) => {
    await allure.story("Product card");
    await allure.description(
      "In a narrow viewport a product card keeps its stepper, or shrinks its add-to-cart button to an icon.",
    );
    const category = frontend.category(SMARTPHONES.path);
    const card = await test.step(`arrange: find ${PRODUCT_SKU}`, async () => {
      await category.navigate();
      return category.scrollToProduct(PRODUCT_SKU);
    });

    await test.step("act: narrow the viewport", () => page.setViewportSize(NARROW_VIEWPORT));

    await test.step("assert: the compact quantity control is shown", async () => {
      await expect(card.quantity.compact).toBeVisible();
    });
  });

  test("change the cart from a product card", async ({ frontend }) => {
    await allure.story("Product card");
    await allure.description("Changing a product card's quantity changes the cart badge with it.");
    const category = frontend.category(SMARTPHONES.path);
    const { quantity } = await test.step(`arrange: find ${PRODUCT_SKU}`, async () => {
      await category.navigate();
      return category.scrollToProduct(PRODUCT_SKU);
    });

    for (const { quantity: next, badge } of CARD_QUANTITIES) {
      await test.step(`act: set the quantity to ${next}`, () => quantity.setQuantity(next));
      await test.step(`assert: the cart badge shows ${badge}`, async () => {
        await expect(category.cartQuantityLabel).toHaveText(badge);
      });
    }
  });

  test("change the cart from product variations", async ({ frontend }) => {
    await allure.story("Product card");
    await allure.description("Changing the quantities of a family's variations keeps a running total in the badge.");
    const category = frontend.category(SMARTPHONES.path);
    const card = await test.step(`arrange: open the variations of ${FAMILY_SKU} in the list view`, async () => {
      await category.navigate();
      await category.listViewTab.click();
      const family = await category.scrollToProduct(FAMILY_SKU);
      await family.variationsButton.click();
      return family;
    });

    for (const { sku, quantity, badge } of VARIATION_QUANTITIES) {
      await test.step(`act: set ${sku} to ${quantity}`, () => card.variation(sku).setQuantity(quantity));
      await test.step(`assert: the cart badge shows ${badge}`, async () => {
        await expect(category.cartQuantityLabel).toHaveText(badge);
      });
    }
  });

  test("a configurable product card links to its configuration", async ({ frontend }) => {
    await allure.story("Product card");
    await allure.description("A configurable product's card links to the product page with its configuration.");
    const category = frontend.category(LAPTOPS);
    const card = await test.step(`arrange: find ${CONFIGURABLE.sku}`, async () => {
      await category.navigate();
      return category.scrollToProduct(CONFIGURABLE.sku);
    });

    const productTab = await test.step("act: follow the configure link", () => card.openConfigurations());

    await test.step("assert: the product page opens with its configuration", async () => {
      await expect(productTab).toHaveURL(new RegExp(CONFIGURABLE.slug));
      await expect(new ProductPage(productTab, CONFIGURABLE.path).configuration.root).toBeVisible();
    });
  });
});
