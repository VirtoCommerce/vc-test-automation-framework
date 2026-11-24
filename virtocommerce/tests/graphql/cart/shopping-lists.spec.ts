import { expect, test } from "@fixtures";
import {
  AddItemsToShoppingListDocument,
  ChangeShoppingListDocument,
  GetShoppingListDocument,
  GetShoppingListsDocument,
  RemoveItemsFromShoppingListDocument,
  UpdateShoppingListItemsDocument,
} from "@graphql/generated/graphql.ts";
import { lineItemOf } from "@graphql/line-items.ts";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";
const ORGANIZATION_SCOPE = "Organization";

test.describe("shopping lists (customer of their own)", () => {
  test.use({ shopperAs: "customer" });

  test("create and read a shopping list", async ({ shopper, arrange }) => {
    const list = await test.step("act: create a shopping list", () => arrange.carts.shoppingList(shopper));

    await test.step("assert: the list is empty and readable", async () => {
      const { storeId, cultureName } = shopper.storeContext;
      expect(list).toMatchObject({ storeId, items: [] });
      const { wishlist } = await shopper.graphql.execute(GetShoppingListDocument, { listId: list.id, cultureName });
      expect(wishlist).toMatchObject({ id: list.id, name: list.name });
    });
  });

  test("list the shopping lists of the user", async ({ shopper, arrange }) => {
    const created = await test.step("arrange: two shopping lists", async () => [
      await arrange.carts.shoppingList(shopper),
      await arrange.carts.shoppingList(shopper),
    ]);

    const { wishlists } = await test.step("act: list the shopping lists", () =>
      shopper.graphql.execute(GetShoppingListsDocument, shopper.storeContext));

    await test.step("assert: exactly the two lists are listed", () => {
      expect(wishlists?.items?.map((list) => list?.id).toSorted()).toEqual(created.map(({ id }) => id).toSorted());
    });
  });

  test("rename, describe and share a shopping list", async ({ shopper, arrange }) => {
    const list = await test.step("arrange: shopping list", () => arrange.carts.shoppingList(shopper));
    const changes = { listName: `${list.name}-renamed`, description: "Updated description", scope: ORGANIZATION_SCOPE };

    const { changeWishlist } = await test.step("act: change the name, description and scope", () =>
      shopper.graphql.execute(ChangeShoppingListDocument, { command: { listId: list.id, ...changes } }));

    await test.step("assert: the list has the new name, description and organization scope", () => {
      expect(changeWishlist).toMatchObject({
        name: changes.listName,
        description: changes.description,
        sharingSetting: { scope: ORGANIZATION_SCOPE },
      });
    });
  });

  test("add an item to a shopping list", async ({ shopper, arrange }) => {
    const list = await test.step("arrange: shopping list", () => arrange.carts.shoppingList(shopper));

    const { addWishlistItems } = await test.step("act: add a product ×3", () =>
      shopper.graphql.execute(AddItemsToShoppingListDocument, {
        command: { listId: list.id, listItems: [{ productId: PRODUCT_ID, quantity: 3 }] },
      }));

    await test.step("assert: the list has the product ×3", () => {
      expect(lineItemOf(addWishlistItems, PRODUCT_ID).quantity).toBe(3);
    });
  });

  test("change the quantity of a shopping list item", async ({ shopper, arrange }) => {
    const list = await test.step("arrange: shopping list with a product ×1", () =>
      arrange.carts.shoppingList(shopper, [{ productId: PRODUCT_ID, quantity: 1 }]));
    const item = lineItemOf(list, PRODUCT_ID);

    const { updateWishListItems } = await test.step("act: change the quantity to 3", () =>
      shopper.graphql.execute(UpdateShoppingListItemsDocument, {
        command: { listId: list.id, items: [{ lineItemId: item.id, quantity: 3 }] },
      }));

    await test.step("assert: the same item has quantity 3", () => {
      expect(lineItemOf(updateWishListItems, PRODUCT_ID)).toMatchObject({ id: item.id, quantity: 3 });
    });
  });

  test("remove an item from a shopping list", async ({ shopper, arrange }) => {
    const list = await test.step("arrange: shopping list with a product", () =>
      arrange.carts.shoppingList(shopper, [{ productId: PRODUCT_ID, quantity: 1 }]));

    const { removeWishlistItems } = await test.step("act: remove the item", () =>
      shopper.graphql.execute(RemoveItemsFromShoppingListDocument, {
        command: { listId: list.id, lineItemIds: [lineItemOf(list, PRODUCT_ID).id] },
      }));

    await test.step("assert: the list is empty", () => {
      expect(removeWishlistItems).toMatchObject({ itemsCount: 0, items: [] });
    });
  });
});
