import type { Frontend } from "@pages/frontend/frontend";

import * as allure from "allure-js-commons";

import { GetShoppingListDocument } from "@api/graphql/generated/graphql";
import { expect, test } from "@fixtures";
import { whenGraphql } from "@pages/responses";

const SMARTPHONES = "smartphones";
const PRODUCT = { id: "product-smartphone-samsung-galaxy-a57-5g", sku: "smartphone-samsung-galaxy-a57-5g" } as const;
const FAMILY_SKU = "smartphone-google-pixel-10-frost";
const VARIATION = {
  id: "product-smartphone-google-pixel-10-indigo",
  sku: "smartphone-google-pixel-10-indigo",
  path: "smartphones/google-pixel-10-indigo",
} as const;
const ADD_TO_LIST_SOURCES = [
  {
    source: "the category grid",
    sku: PRODUCT.sku,
    open: async (frontend: Frontend) => {
      const category = frontend.category(SMARTPHONES);
      await category.navigate();
      await (await category.scrollToProduct(PRODUCT.sku)).addToListButton.click();
    },
  },
  {
    source: "the category list",
    sku: FAMILY_SKU,
    open: async (frontend: Frontend) => {
      const category = frontend.category(SMARTPHONES);
      await category.navigate();
      await category.listViewTab.click();
      await (await category.scrollToProduct(FAMILY_SKU)).addToListButton.click();
    },
  },
  {
    source: "the product page",
    sku: VARIATION.sku,
    open: async (frontend: Frontend) => {
      const product = frontend.product(VARIATION.path);
      await product.navigate();
      await product.addToListButton.click();
    },
  },
] as const;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Lists");
});

test.describe("list items (customer of their own)", () => {
  test.use({ shopperKind: "customer" });

  for (const { source, sku, open } of ADD_TO_LIST_SOURCES) {
    test(`add a product to a list from ${source}`, async ({ frontend, page, shopper, arrange }) => {
      await allure.story("Items");
      await allure.description(`A product added to a list from ${source} is stored in the list.`);
      const list = await test.step("arrange: an empty list", () => arrange.carts.shoppingList(shopper.api));
      const modal = frontend.addToListsModal;

      await test.step(`arrange: open the add-to-list modal from ${source}`, async () => {
        await open(frontend);
        await expect(modal.root).toBeVisible();
      });

      await test.step("act: tick the list and save", async () => {
        await modal.listCheckbox(list.id).click();
        await whenGraphql(page, "AddWishlistBulkItem", () => modal.saveButton.click());
      });

      await test.step(`assert: the list holds ${sku}`, async () => {
        await expect(modal.root).toBeHidden();
        const { wishlist } = await shopper.api.graphql.execute(GetShoppingListDocument, { listId: list.id });
        expect(wishlist?.items?.map((item) => item?.sku)).toEqual([sku]);
      });
    });
  }

  test("take a product off a list from the add-to-list modal", async ({ frontend, page, shopper, arrange }) => {
    await allure.story("Items");
    await allure.description("Unticking a list in the add-to-list modal takes the product off the list.");
    const list = await test.step(`arrange: a list with ${PRODUCT.sku}`, () =>
      arrange.carts.shoppingList(shopper.api, [{ productId: PRODUCT.id, quantity: 1 }]));
    const modal = frontend.addToListsModal;
    const category = frontend.category(SMARTPHONES);

    await test.step("arrange: open the add-to-list modal from the category grid", async () => {
      await category.navigate();
      await (await category.scrollToProduct(PRODUCT.sku)).addToListButton.click();
      await expect(modal.root).toBeVisible();
    });

    await test.step("act: untick the list and save", async () => {
      await modal.listWithProductCheckbox(list.id).click();
      await whenGraphql(page, "DeleteWishlistItem", () => modal.saveButton.click());
    });

    await test.step("assert: the list is empty", async () => {
      await expect(modal.root).toBeHidden();
      const { wishlist } = await shopper.api.graphql.execute(GetShoppingListDocument, { listId: list.id });
      expect(wishlist?.items).toEqual([]);
    });
  });

  test("add every product of a list to the cart", async ({ frontend, page, shopper, arrange }) => {
    await allure.story("Items");
    await allure.description("Adding all of a list's products to the cart puts each of them in the cart.");
    const list = await test.step("arrange: a list with two products", () =>
      arrange.carts.shoppingList(shopper.api, [
        { productId: PRODUCT.id, quantity: 1 },
        { productId: VARIATION.id, quantity: 1 },
      ]));
    const listPage = frontend.list(list.id);
    const cart = frontend.cart();

    await test.step("arrange: open the list", async () => {
      await listPage.navigate();
      await expect(listPage.lineItems).toHaveCount(2);
    });

    await test.step("act: add all products to the cart", () =>
      whenGraphql(page, "AddItemsCart", () => listPage.addAllToCartButton.click()));

    await test.step("assert: the cart holds both products", async () => {
      await expect(listPage.cartQuantityLabel).toHaveText("2");
      await cart.navigate();
      await expect(cart.lineItems).toHaveCount(2);
      await expect(cart.lineItem(PRODUCT.sku).root).toBeVisible();
      await expect(cart.lineItem(VARIATION.sku).root).toBeVisible();
    });
  });
});
