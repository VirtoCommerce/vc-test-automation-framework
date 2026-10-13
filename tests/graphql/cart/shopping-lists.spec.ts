import * as allure from "allure-js-commons";

import {
  AddItemsToShoppingListDocument,
  ChangeShoppingListDocument,
  GetShoppingListDocument,
  GetShoppingListsDocument,
  RemoveItemsFromShoppingListDocument,
  UpdateShoppingListItemsDocument,
} from "@api/graphql/generated/graphql";
import { lineItemOf } from "@api/graphql/line-items";
import { expect, test } from "@fixtures";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const ORGANIZATION_SCOPE = "Organization";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Cart / Shopping Lists");
});

test.describe("shopping lists (customer of their own)", () => {
  test("create and read a shopping list", async ({ arrange }) => {
    await allure.story("Lists");
    await allure.description("A new shopping list is empty, belongs to the store and can be read back by id.");
    const { api } = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());

    const list = await test.step("act: create a shopping list", () => arrange.carts.shoppingList(api));

    await test.step("assert: the list is empty and readable", async () => {
      const { storeId, cultureName } = await api.storeContext();
      expect(list).toMatchObject({ storeId, items: [] });
      const { wishlist } = await api.graphql.execute(GetShoppingListDocument, { listId: list.id, cultureName });
      expect(wishlist).toMatchObject({ id: list.id, name: list.name });
    });
  });

  test("list the shopping lists of the user", async ({ arrange }) => {
    await allure.story("Lists");
    await allure.description("A user's shopping lists are exactly the ones they created.");
    const { api } = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const created = await test.step("arrange: two shopping lists", async () => [
      await arrange.carts.shoppingList(api),
      await arrange.carts.shoppingList(api),
    ]);

    const { wishlists } = await test.step("act: list the shopping lists", async () =>
      api.graphql.execute(GetShoppingListsDocument, await api.storeContext()));

    await test.step("assert: exactly the two lists are listed", () => {
      expect(wishlists?.items?.map((list) => list?.id).toSorted()).toEqual(created.map(({ id }) => id).toSorted());
    });
  });

  test("rename, describe and share a shopping list", async ({ arrange }) => {
    await allure.story("Lists");
    await allure.description("A list's name, description and sharing scope change in one mutation.");
    const { api } = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const list = await test.step("arrange: shopping list", () => arrange.carts.shoppingList(api));
    const changes = { listName: `${list.name}-renamed`, description: "Updated description", scope: ORGANIZATION_SCOPE };

    const { changeWishlist } = await test.step("act: change the name, description and scope", () =>
      api.graphql.execute(ChangeShoppingListDocument, { command: { listId: list.id, ...changes } }));

    await test.step("assert: the list has the new name, description and organization scope", () => {
      expect(changeWishlist).toMatchObject({
        name: changes.listName,
        description: changes.description,
        sharingSetting: { scope: ORGANIZATION_SCOPE },
      });
    });
  });

  test("add an item to a shopping list", async ({ arrange }) => {
    await allure.story("Items");
    await allure.description("A product added to a list is on it with its quantity.");
    const { api } = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const list = await test.step("arrange: shopping list", () => arrange.carts.shoppingList(api));

    const { addWishlistItems } = await test.step("act: add a product ×3", () =>
      api.graphql.execute(AddItemsToShoppingListDocument, {
        command: { listId: list.id, listItems: [{ productId: PRODUCT_ID, quantity: 3 }] },
      }));

    await test.step("assert: the list has the product ×3", () => {
      expect(lineItemOf(addWishlistItems, PRODUCT_ID).quantity).toBe(3);
    });
  });

  test("change the quantity of a shopping list item", async ({ arrange }) => {
    await allure.story("Items");
    await allure.description("Changing the quantity of a list item keeps the same item.");
    const { api } = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const list = await test.step("arrange: shopping list with a product ×1", () =>
      arrange.carts.shoppingList(api, [{ productId: PRODUCT_ID, quantity: 1 }]));
    const item = lineItemOf(list, PRODUCT_ID);

    const { updateWishListItems } = await test.step("act: change the quantity to 3", () =>
      api.graphql.execute(UpdateShoppingListItemsDocument, {
        command: { listId: list.id, items: [{ lineItemId: item.id, quantity: 3 }] },
      }));

    await test.step("assert: the same item has quantity 3", () => {
      expect(lineItemOf(updateWishListItems, PRODUCT_ID)).toMatchObject({ id: item.id, quantity: 3 });
    });
  });

  test("remove an item from a shopping list", async ({ arrange }) => {
    await allure.story("Items");
    await allure.description("Removing the only item of a list leaves it empty.");
    const { api } = await test.step("arrange: a customer of their own", () => arrange.customers.customerAccount());
    const list = await test.step("arrange: shopping list with a product", () =>
      arrange.carts.shoppingList(api, [{ productId: PRODUCT_ID, quantity: 1 }]));

    const { removeWishlistItems } = await test.step("act: remove the item", () =>
      api.graphql.execute(RemoveItemsFromShoppingListDocument, {
        command: { listId: list.id, lineItemIds: [lineItemOf(list, PRODUCT_ID).id] },
      }));

    await test.step("assert: the list is empty", () => {
      expect(removeWishlistItems).toMatchObject({ itemsCount: 0, items: [] });
    });
  });
});
