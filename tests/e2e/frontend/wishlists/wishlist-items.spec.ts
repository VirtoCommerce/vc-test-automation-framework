import type { Page } from "@playwright/test";
import type { SignedInCustomerAccount } from "@fixtures";

import * as allure from "allure-js-commons";

import { GetShoppingListDocument } from "@api/graphql/generated/graphql";
import { requireFields, requireItems } from "@core/required-fields";
import { cartScope } from "@dataset/arrange/cart";
import { arrangeShoppingList, arrangeShoppingListWithItems } from "@dataset/arrange/shopping-list";
import { SEEDED_PRODUCTS } from "@dataset/seeded";
import { expect, test, withCustomerAccount } from "@fixtures";
import { AddToWishlistsModal } from "@pages/frontend/components/wishlist";
import { AccountListDetailsPage } from "@pages/frontend/pages/account-pages";
import { CartPage } from "@pages/frontend/pages/cart-page";
import { CategoryPage } from "@pages/frontend/pages/category-page";
import { ProductPage } from "@pages/frontend/pages/product-page";
import { isGraphqlOperation } from "@pages/graphql-traffic";

const SMARTPHONES = "smartphones";
const PRODUCT_SKU = SEEDED_PRODUCTS.galaxyA57;
const VARIATIONS_PARENT_SKU = SEEDED_PRODUCTS.pixel10Frost;
const VARIATION_SKU = "smartphone-google-pixel-10-indigo";

interface AddToListSource {
  readonly title: string;
  readonly sku: string;
  open(page: Page): Promise<void>;
}

const FROM_CATEGORY_GRID: AddToListSource = {
  title: "the category grid",
  sku: PRODUCT_SKU,
  async open(page) {
    const categoryPage = new CategoryPage(page, SMARTPHONES);
    await categoryPage.navigate();
    await (await categoryPage.scrollToProduct(PRODUCT_SKU)).addToListButton.click();
  },
};

const ADD_TO_LIST_SOURCES: readonly AddToListSource[] = [
  FROM_CATEGORY_GRID,
  {
    title: "the category list",
    sku: VARIATIONS_PARENT_SKU,
    async open(page) {
      const categoryPage = new CategoryPage(page, SMARTPHONES);
      await categoryPage.navigate();
      await categoryPage.viewSwitcher.listViewTab.click();
      await (await categoryPage.scrollToProduct(VARIATIONS_PARENT_SKU)).addToListButton.click();
    },
  },
  {
    title: "the product page",
    sku: VARIATION_SKU,
    async open(page) {
      const productPage = new ProductPage(page, `product/${VARIATION_SKU}`);
      await productPage.navigate();
      await productPage.addToListButton.click();
    },
  },
];

test.beforeEach(async () => {
  await allure.feature("Wishlists / Items (E2E)");
});

test.describe("wishlist items (customer account)", () => {
  test.use({ browserCustomerAccount: withCustomerAccount });

  for (const source of ADD_TO_LIST_SOURCES) {
    test(`add a product to a wishlist from ${source.title}`, async ({ page, customerAccount, cleanupStack }) => {
      const list = await test.step("arrange: an empty wishlist", () =>
        arrangeShoppingList(customerAccount.graphqlClient, cleanupStack, cartScope(customerAccount.context)));
      const modal = new AddToWishlistsModal(page);

      await test.step(`arrange: open the add-to-list modal from ${source.title}`, async () => {
        await source.open(page);
        await expect(modal.root).toBeVisible();
      });

      await test.step(`act: tick ${list.name} and save`, async () => {
        await modal.listCheckbox(list.id).click();
        await Promise.all([page.waitForResponse(isGraphqlOperation("AddWishlistBulkItem")), modal.saveButton.click()]);
      });

      await test.step(`assert: the wishlist holds ${source.sku}`, async () => {
        await expect(modal.root).toBeHidden();
        await expect.poll(() => listSkus(customerAccount, list.id)).toContain(source.sku);
      });
    });
  }

  test("remove a product from a wishlist via the add-to-list modal", async ({
    page,
    customerAccount,
    cleanupStack,
  }) => {
    const list = await test.step(`arrange: a wishlist with ${PRODUCT_SKU}`, () =>
      arrangeShoppingListWithItems(customerAccount.graphqlClient, cleanupStack, cartScope(customerAccount.context), [
        { productId: PRODUCT_SKU, quantity: 1 },
      ]));
    const modal = new AddToWishlistsModal(page);

    await test.step("arrange: open the add-to-list modal from the category grid", async () => {
      await FROM_CATEGORY_GRID.open(page);
      await expect(modal.root).toBeVisible();
    });

    await test.step(`act: untick ${list.name} and save`, async () => {
      await modal.listWithProductCheckbox(list.id).click();
      await Promise.all([page.waitForResponse(isGraphqlOperation("DeleteWishlistItem")), modal.saveButton.click()]);
    });

    await test.step(`assert: the wishlist no longer holds ${PRODUCT_SKU}`, async () => {
      await expect(modal.root).toBeHidden();
      await expect.poll(() => listSkus(customerAccount, list.id)).not.toContain(PRODUCT_SKU);
    });
  });

  test("add every wishlist product to the cart", async ({ page, customerAccount, cleanupStack }) => {
    const skus = [PRODUCT_SKU, VARIATION_SKU];
    const list = await test.step("arrange: a wishlist with two products", () =>
      arrangeShoppingListWithItems(
        customerAccount.graphqlClient,
        cleanupStack,
        cartScope(customerAccount.context),
        skus.map((productId) => ({ productId, quantity: 1 })),
      ));
    const detailsPage = new AccountListDetailsPage(page, list.id);

    await test.step("arrange: open the wishlist details", async () => {
      await detailsPage.navigate();
      await expect(detailsPage.lineItems).toHaveCount(skus.length);
    });

    await test.step("act: add all products to the cart", () =>
      Promise.all([page.waitForResponse(isGraphqlOperation("AddItemsCart")), detailsPage.addAllToCartButton.click()]));

    await test.step("assert: the cart holds both products", async () => {
      await expect(detailsPage.cartQuantityLabel).toHaveText(String(skus.length));
      const cartPage = new CartPage(page);
      await cartPage.navigate();
      await expect(cartPage.lineItems).toHaveCount(skus.length);
      for (const sku of skus) {
        await expect(cartPage.lineItem(sku).root).toBeVisible();
      }
    });
  });
});

async function listSkus(account: SignedInCustomerAccount, listId: string): Promise<string[]> {
  const { wishlist } = await account.graphqlClient.execute(GetShoppingListDocument, {
    listId,
    cultureName: account.context.cultureName,
  });
  return requireItems(wishlist?.items, `Items of list ${listId}`).map(
    (item) => requireFields(item, ["sku"], `Item of list ${listId}`).sku,
  );
}
