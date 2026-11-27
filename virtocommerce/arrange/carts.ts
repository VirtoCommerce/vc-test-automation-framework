import type {
  CartFragment,
  InputNewCartItemType,
  InputNewWishlistItemType,
  ShoppingListFragment,
} from "../graphql/generated/graphql.ts";
import type { WithRequired } from "../support/require-fields.ts";
import type { ArrangeContext } from "./context.ts";
import type { Shopper } from "./shopper.ts";

import {
  AddItemsCartDocument,
  AddItemsToShoppingListDocument,
  AddOrUpdateCartPaymentDocument,
  AddOrUpdateCartShipmentDocument,
  ChangeShoppingListDocument,
  CreateShoppingListDocument,
  DeleteShoppingListDocument,
  GetCartDocument,
  GetShoppingListDocument,
  GetShoppingListsDocument,
  RemoveCartDocument,
} from "../graphql/generated/graphql.ts";
import { requireFields } from "../support/require-fields.ts";
import { uniqueId } from "../support/unique-id.ts";

/** A product to add to a cart, such as `{ productId, quantity: 2 }`, with its configuration when configurable. */
export type CartItem = Pick<InputNewCartItemType, "productId" | "quantity" | "configurationSections">;

/** A cart as xAPI returns it. */
export type ArrangedCart = CartFragment;

/** A shopping list as xAPI returns it, with its identifier. */
export type ArrangedShoppingList = WithRequired<ShoppingListFragment, "id">;

/** Arranges carts and shopping lists in a shopper's session. */
export interface CartsArrange {
  /**
   * Adds products to the shopper's default cart, the one the frontend shows, and removes the cart after the test.
   *
   * @returns The cart.
   * @throws {Error} The cart does not hold every product, because the store cannot sell one of them.
   */
  cart(shopper: Shopper, items: readonly CartItem[]): Promise<ArrangedCart>;
  /**
   * Like {@link CartsArrange#cart}, with the empty shipment and payment that the frontend adds on its first visit to
   * the cart page, so the page sends no writes of its own. Use it for frontend tests that change the cart.
   *
   * @returns The cart.
   */
  checkoutReadyCart(shopper: Shopper, items: readonly CartItem[]): Promise<ArrangedCart>;
  /** Removes a cart of the shopper after the test, such as a named cart that the code under test creates. */
  removeCartLater(shopper: Shopper, cartId: string): void;
  /**
   * Removes the shopper's default cart after the test, such as one the frontend creates. Registered once for each
   * shopper, however often it is called.
   */
  removeDefaultCartLater(shopper: Shopper): void;
  /**
   * Creates a shopping list of the shopper, with products when given, and deletes it after the test unless it is
   * already gone.
   *
   * @returns The list.
   */
  shoppingList(shopper: Shopper, items?: readonly InputNewWishlistItemType[]): Promise<ArrangedShoppingList>;
  /**
   * Creates a shopping list as {@link CartsArrange#shoppingList} does, and shares it.
   *
   * @param scope - Who may open the list, such as `AnyoneAnonymous`.
   * @returns The list and the key of its share link.
   */
  sharedList(
    shopper: Shopper,
    items: readonly InputNewWishlistItemType[],
    scope: string,
  ): Promise<{ readonly list: ArrangedShoppingList; readonly sharingKey: string }>;
  /** Deletes every shopping list of the shopper after the test, such as the lists that the frontend creates. */
  deleteShoppingListsLater(shopper: Shopper): void;
}

/**
 * Returns the cart methods of `arrange`.
 *
 * @param context - What the methods create and remove data with.
 * @returns The methods.
 */
export function cartsArrange({ later }: ArrangeContext): CartsArrange {
  const covered = new Set<string>();

  async function cart(shopper: Shopper, items: readonly CartItem[]): Promise<ArrangedCart> {
    removeDefaultCartLater(shopper);
    const { addItemsCart } = await shopper.graphql.execute(AddItemsCartDocument, {
      command: { ...shopper.storeContext, cartItems: [...items] },
    });
    const arranged = requireFields(addItemsCart, ["id"], `The cart of ${shopper.userId}`);
    const expected = items.reduce((total, { quantity }) => total + (quantity ?? 1), 0);
    if (arranged.itemsQuantity !== expected) {
      throw new Error(
        `The cart holds ${arranged.itemsQuantity} items instead of ${expected}: the store cannot sell every ` +
          `product of ${JSON.stringify(items.map(({ productId }) => productId))}`,
      );
    }
    return arranged;
  }

  async function checkoutReadyCart(shopper: Shopper, items: readonly CartItem[]): Promise<ArrangedCart> {
    const { id: cartId } = await cart(shopper, items);
    const { graphql, storeContext } = shopper;
    await graphql.execute(AddOrUpdateCartShipmentDocument, { command: { ...storeContext, cartId, shipment: {} } });
    const { addOrUpdateCartPayment } = await graphql.execute(AddOrUpdateCartPaymentDocument, {
      command: { ...storeContext, cartId, payment: {} },
    });
    return requireFields(addOrUpdateCartPayment, ["id"], `The cart of ${shopper.userId}`);
  }

  function removeCartLater(shopper: Shopper, cartId: string): void {
    later(`remove cart ${cartId}`, () =>
      shopper.graphql.execute(RemoveCartDocument, { command: { cartId, userId: shopper.userId } }),
    );
  }

  function removeDefaultCartLater(shopper: Shopper): void {
    if (covered.has(shopper.userId)) {
      return;
    }
    covered.add(shopper.userId);
    later(`remove the default cart of ${shopper.credentials?.username ?? "the anonymous visitor"}`, async () => {
      const { cart: found } = await shopper.graphql.execute(GetCartDocument, shopper.storeContext);
      if (found !== null) {
        await shopper.graphql.execute(RemoveCartDocument, { command: { cartId: found.id, userId: shopper.userId } });
      }
    });
  }

  async function shoppingList(
    shopper: Shopper,
    items: readonly InputNewWishlistItemType[] = [],
  ): Promise<ArrangedShoppingList> {
    const listName = uniqueId("test-shopping-list");
    const { createWishlist } = await shopper.graphql.execute(CreateShoppingListDocument, {
      command: { ...shopper.storeContext, listName, description: "Created by an automated test" },
    });
    const list = requireFields(createWishlist, ["id"], `Shopping list ${listName}`);
    later(`delete shopping list ${listName}`, async () => {
      const { wishlist } = await shopper.graphql.execute(GetShoppingListDocument, { listId: list.id });
      if (wishlist !== null) {
        await shopper.graphql.execute(DeleteShoppingListDocument, { command: { listId: list.id } });
      }
    });
    if (items.length === 0) {
      return list;
    }
    const { addWishlistItems } = await shopper.graphql.execute(AddItemsToShoppingListDocument, {
      command: { listId: list.id, listItems: [...items] },
    });
    return requireFields(addWishlistItems, ["id"], `Shopping list ${listName}`);
  }

  async function sharedList(
    shopper: Shopper,
    items: readonly InputNewWishlistItemType[],
    scope: string,
  ): Promise<{ readonly list: ArrangedShoppingList; readonly sharingKey: string }> {
    const list = await shoppingList(shopper, items);
    const { changeWishlist } = await shopper.graphql.execute(ChangeShoppingListDocument, {
      command: { listId: list.id, scope },
    });
    const sharing = requireFields(changeWishlist?.sharingSetting, ["id"], `The sharing of ${list.name}`);
    return { list, sharingKey: sharing.id };
  }

  function deleteShoppingListsLater(shopper: Shopper): void {
    later(`delete the shopping lists of ${shopper.credentials?.username ?? "the anonymous visitor"}`, async () => {
      const { wishlists } = await shopper.graphql.execute(GetShoppingListsDocument, shopper.storeContext);
      for (const list of wishlists?.items ?? []) {
        if (list?.id) {
          await shopper.graphql.execute(DeleteShoppingListDocument, { command: { listId: list.id } });
        }
      }
    });
  }

  return {
    cart,
    checkoutReadyCart,
    removeCartLater,
    removeDefaultCartLater,
    shoppingList,
    sharedList,
    deleteShoppingListsLater,
  };
}
