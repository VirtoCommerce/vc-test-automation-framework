import * as allure from "allure-js-commons";

import {
  AddBulkItemsCartDocument,
  AddItemDocument,
  RemoveCartItemDocument,
  UpdateCartQuantityDocument,
} from "@api/graphql/generated/graphql";
import { lineItemOf } from "@api/graphql/line-items";
import { requireFields } from "@core/required-fields";
import { uniqueId } from "@core/unique-id";
import { expect, test } from "@fixtures";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const VARIATION_ID = "product-smartphone-apple-iphone-17-256gb-mist-blue";
const KINDS = [
  { kind: "product", productId: PRODUCT_ID },
  { kind: "variation", productId: VARIATION_ID },
] as const;

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Cart / Items");
});

test.describe("cart items (anonymous)", () => {
  test("add several products in one mutation", async ({ api, arrange }) => {
    await allure.story("Add items");
    await allure.description("Adding two products in one AddItemsCart mutation puts both in the cart.");
    const items = [
      { productId: PRODUCT_ID, quantity: 3 },
      { productId: VARIATION_ID, quantity: 4 },
    ];

    const cart = await test.step("act: add two products", () => arrange.carts.cart(api, items));

    await test.step("assert: both products are in the cart with their quantities", () => {
      expect(cart.items).toEqual(expect.arrayContaining(items.map((item) => expect.objectContaining(item))));
    });
  });

  for (const { kind, productId } of KINDS) {
    test(`add a single ${kind} to a new cart`, async ({ api, arrange }) => {
      await allure.story("Add items");
      await allure.description(`Adding one ${kind} with AddItem creates a cart of the shopper holding it.`);
      const context = await api.storeContext();

      const { addItem } = await test.step(`act: add the ${kind} ×1`, () =>
        api.graphql.execute(AddItemDocument, {
          command: { ...context, cartName: uniqueId("test-cart"), productId, quantity: 1 },
        }));
      const cart = requireFields(addItem, ["id"], `Cart with the ${kind}`);
      await arrange.carts.removeCartLater(api, cart.id);

      await test.step(`assert: a cart of the shopper holds the ${kind} ×1`, () => {
        expect(cart).toMatchObject({ customerId: context.userId, itemsQuantity: 1 });
        expect(lineItemOf(cart, productId).quantity).toBe(1);
      });
    });
  }

  test("add products by SKU in bulk", async ({ api, arrange, dataset }) => {
    await allure.story("Add items");
    await allure.description("Adding products by SKU in bulk puts each SKU in the cart without errors.");
    const items = [
      { productSku: String(dataset.products.get(PRODUCT_ID).code), quantity: 5 },
      { productSku: String(dataset.products.get(VARIATION_ID).code), quantity: 10 },
    ];

    const { addBulkItemsCart } = await test.step("act: add two SKUs in bulk", async () =>
      api.graphql.execute(AddBulkItemsCartDocument, {
        command: { ...(await api.storeContext()), cartName: uniqueId("test-cart"), cartItems: items },
      }));
    const cart = requireFields(addBulkItemsCart?.cart, ["id"], "Bulk cart");
    await arrange.carts.removeCartLater(api, cart.id);

    await test.step("assert: both SKUs are in the cart without errors", () => {
      expect(addBulkItemsCart?.errors).toEqual([]);
      expect(cart.itemsQuantity).toBe(15);
      expect(cart.items).toEqual(
        expect.arrayContaining(
          items.map(({ productSku, quantity }) => expect.objectContaining({ sku: productSku, quantity })),
        ),
      );
    });
  });

  for (const { kind, productId } of KINDS) {
    test(`change the quantity of a ${kind} line item`, async ({ api, arrange }) => {
      await allure.story("Change quantity");
      await allure.description(`Setting a new quantity of a ${kind} line changes that line only.`);
      const cart = await test.step(`arrange: cart with the ${kind} ×3`, () =>
        arrange.carts.cart(api, [{ productId, quantity: 3 }]));

      const { updateCartQuantity } = await test.step(`act: set the ${kind} quantity to 5`, async () =>
        api.graphql.execute(UpdateCartQuantityDocument, {
          command: { ...(await api.storeContext()), cartId: cart.id, items: [{ productId, quantity: 5 }] },
        }));

      await test.step(`assert: the cart has the ${kind} ×5`, () => {
        expect(updateCartQuantity?.items).toEqual([expect.objectContaining({ productId, quantity: 5 })]);
      });
    });
  }

  test("remove a line item", async ({ api, arrange }) => {
    await allure.story("Remove items");
    await allure.description("Removing the only line item leaves an empty cart.");
    const cart = await test.step("arrange: cart with a product", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 1 }]));

    const { removeCartItem } = await test.step("act: remove the line item", async () =>
      api.graphql.execute(RemoveCartItemDocument, {
        command: { ...(await api.storeContext()), cartId: cart.id, lineItemId: lineItemOf(cart, PRODUCT_ID).id },
      }));

    await test.step("assert: the cart is empty", () => {
      expect(removeCartItem).toMatchObject({ itemsCount: 0, items: [] });
    });
  });
});
