import { expect, test } from "@fixtures";
import { GetCartDocument } from "@graphql/generated/graphql.ts";
import { whenGraphql } from "@pages/shared/responses.ts";

const SKU = "smartphone-samsung-galaxy-a57-5g";
const QUANTITY = 3;
const NEW_QUANTITY = 4;
const CART = [{ productId: `product-${SKU}`, quantity: QUANTITY }];

test.describe("cart of an anonymous visitor", () => {
  test.beforeEach(({ arrange, shopper }) => arrange.carts.checkoutReadyCart(shopper, CART));

  test("clear the cart", async ({ frontend, page }) => {
    const cart = frontend.cart();
    await cart.navigate();
    await expect(cart.lineItems).toHaveCount(1);

    await test.step("act: clear the cart and confirm", async () => {
      await cart.clearCartButton.click();
      await whenGraphql(page, "ClearCart", () => cart.clearCartModal.confirmButton.click());
    });

    await test.step("assert: the modal closes and no line items remain", async () => {
      await expect(cart.clearCartModal.root).toBeHidden();
      await expect(cart.lineItems).toHaveCount(0);
    });
  });

  test("remove a line item", async ({ frontend }) => {
    const cart = frontend.cart();
    const lineItem = cart.lineItem(SKU);
    await cart.navigate();
    await expect(lineItem.root).toBeVisible();

    await test.step("act: remove the line item", () => lineItem.removeButton.click());

    await test.step("assert: the line item is gone", async () => {
      await expect(lineItem.root).toBeHidden();
    });
  });
});

test.describe("cart of a customer", () => {
  test.use({ shopperAs: "customer" });
  test.beforeEach(({ arrange, shopper }) => arrange.carts.checkoutReadyCart(shopper, CART));

  test("change the quantity of a line item", async ({ frontend, shopper }) => {
    const cart = frontend.cart();
    const { quantity } = cart.lineItem(SKU);
    await cart.navigate();
    await expect(quantity.input).toHaveValue(String(QUANTITY));

    await test.step(`act: set the quantity to ${NEW_QUANTITY}`, () => quantity.setQuantity(NEW_QUANTITY));

    await test.step(`assert: the badge and the stored cart hold ${NEW_QUANTITY}`, async () => {
      await expect(cart.cartQuantityLabel).toHaveText(String(NEW_QUANTITY));
      await expect
        .poll(async () => {
          const { cart: stored } = await shopper.graphql.execute(GetCartDocument, shopper.storeContext);
          return stored?.items.map((item) => item.quantity);
        })
        .toEqual([NEW_QUANTITY]);
    });
  });

  test("save a line item for later and remove it from the saved list", async ({ frontend }) => {
    const cart = frontend.cart();
    const saved = frontend.savedForLater();
    const savedItem = saved.lineItem(SKU);

    await test.step("act: save the line item for later", async () => {
      await cart.navigate();
      await cart.lineItem(SKU).saveForLaterButton.click();
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
