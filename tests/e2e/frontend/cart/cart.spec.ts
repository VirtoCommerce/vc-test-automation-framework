import * as allure from "allure-js-commons";

import { GetCartDocument } from "@api/graphql/generated/graphql";
import { expect, test } from "@fixtures";
import { isGraphqlOperation } from "@pages/selectors";

const PRODUCT = { id: "product-smartphone-samsung-galaxy-a57-5g", sku: "smartphone-samsung-galaxy-a57-5g" } as const;
const QUANTITY = 3;
const NEW_QUANTITY = 4;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Cart");
});

test.describe("cart (anonymous)", () => {
  test("clear the cart", async ({ frontend, page, shopper, arrange }) => {
    await allure.story("Cart");
    await allure.description("Clearing the cart through its confirmation modal leaves no line items.");
    await test.step(`arrange: the cart holds ${PRODUCT.sku} ×${QUANTITY}`, () =>
      arrange.carts.defaultCart(shopper.api, [{ productId: PRODUCT.id, quantity: QUANTITY }]));
    const cart = frontend.cart();

    await test.step("arrange: open the cart", async () => {
      await cart.navigate();
      await expect(cart.lineItems).toHaveCount(1);
    });

    await test.step("act: clear the cart and confirm", async () => {
      await cart.clearCartButton.click();
      await Promise.all([
        page.waitForResponse(isGraphqlOperation("ClearCart")),
        cart.clearCartModal.confirmButton.click(),
      ]);
    });

    await test.step("assert: the modal closes and no line items remain", async () => {
      await expect(cart.clearCartModal.root).toBeHidden();
      await expect(cart.lineItems).toHaveCount(0);
    });
  });

  test("remove a line item", async ({ frontend, shopper, arrange }) => {
    await allure.story("Line items");
    await allure.description("A removed line item is gone from the cart.");
    await test.step(`arrange: the cart holds ${PRODUCT.sku}`, () =>
      arrange.carts.defaultCart(shopper.api, [{ productId: PRODUCT.id, quantity: QUANTITY }]));
    const cart = frontend.cart();
    const lineItem = cart.lineItem(PRODUCT.sku);

    await test.step("arrange: open the cart", async () => {
      await cart.navigate();
      await expect(lineItem.root).toBeVisible();
    });

    await test.step("act: remove the line item", () => lineItem.removeButton.click());

    await test.step("assert: the line item is gone", async () => {
      await expect(lineItem.root).toBeHidden();
    });
  });
});

test.describe("cart (customer of their own)", () => {
  test.use({ shopperKind: "customer" });

  test("change the quantity of a line item", async ({ frontend, shopper, arrange }) => {
    await allure.story("Line items");
    await allure.description(
      `A line item's quantity changed in the cart, with the configured quantity control, goes from ${QUANTITY} to ` +
        `${NEW_QUANTITY} in the cart badge and the stored cart.`,
    );
    await test.step(`arrange: the cart holds ${PRODUCT.sku} ×${QUANTITY}`, () =>
      arrange.carts.defaultCart(shopper.api, [{ productId: PRODUCT.id, quantity: QUANTITY }]));
    const cart = frontend.cart();
    const { quantity } = cart.lineItem(PRODUCT.sku);

    await test.step("arrange: open the cart", async () => {
      await cart.navigate();
      await expect(quantity.input).toHaveValue(String(QUANTITY));
    });

    await test.step(`act: set the quantity to ${NEW_QUANTITY}`, () => quantity.setQuantity(NEW_QUANTITY));

    await test.step(`assert: the cart holds ${NEW_QUANTITY}`, async () => {
      await expect(cart.cartQuantityLabel).toHaveText(String(NEW_QUANTITY));
      await expect
        .poll(async () => {
          const { cart: stored } = await shopper.api.graphql.execute(GetCartDocument, await shopper.api.storeContext());
          return stored?.items?.map((item) => item?.quantity);
        })
        .toEqual([NEW_QUANTITY]);
    });
  });

  test("save a line item for later and remove it from the saved list", async ({ frontend, shopper, arrange }) => {
    await allure.story("Save for later");
    await allure.description(
      "A line item saved for later leaves the cart and appears in the saved-for-later list, where it can be removed.",
    );
    await test.step(`arrange: the cart holds ${PRODUCT.sku}`, () =>
      arrange.carts.defaultCart(shopper.api, [{ productId: PRODUCT.id, quantity: QUANTITY }]));
    const cart = frontend.cart();
    const saved = frontend.savedForLater();
    const savedItem = saved.lineItem(PRODUCT.sku);

    await test.step("act: save the line item for later", async () => {
      await cart.navigate();
      await cart.lineItem(PRODUCT.sku).saveForLaterButton.click();
    });
    await test.step("assert: the cart is empty and the saved list holds the product", async () => {
      await expect(cart.lineItems).toHaveCount(0);
      await saved.navigate();
      await expect(saved.lineItems).toHaveCount(1);
      await expect(savedItem.root).toBeVisible();
    });

    await test.step("act: remove the saved item and confirm", async () => {
      await savedItem.removeButton.click();
      await saved.removeItemModal.confirmButton.click();
    });
    await test.step("assert: the saved item is gone", async () => {
      await expect(savedItem.root).toBeHidden();
    });
  });
});
