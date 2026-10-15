import type { ApiSession } from "@api/api-session";
import type { CartFragment, InputNewCartItemType, ShoppingListFragment } from "@api/graphql/generated/graphql";
import type { CleanupStack } from "@core/cleanup-stack";
import type { ArrangeContext } from "./context";

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
} from "@api/graphql/generated/graphql";
import { requireFields } from "@core/required-fields";
import { uniqueId } from "@core/unique-id";

/** Product and quantity to add to a cart or shopping list. */
export interface ItemToAdd {
  readonly productId: string;
  readonly quantity: number;
}

/** Cart as xAPI returns it, with a guaranteed id. */
export type ArrangedCart = CartFragment & { readonly id: string };
/** Shopping list as xAPI returns it, with a guaranteed id. */
export type ArrangedShoppingList = ShoppingListFragment & { readonly id: string };

/** Arranges carts and shopping lists in the given shopper's session, and removes the ones the frontend creates. */
export class CartArrange {
  readonly #cleanup: CleanupStack;

  constructor({ cleanup }: ArrangeContext) {
    this.#cleanup = cleanup;
  }

  /**
   * Creates a named (non-default) cart with items in the shopper's session and removes it after the test.
   * Use {@link CartArrange#defaultCart} for the cart the frontend shows.
   *
   * @param itemFields - Fields added to every item, such as `configurationSections`.
   */
  async cart(
    shopper: ApiSession,
    items: readonly ItemToAdd[],
    itemFields: Partial<InputNewCartItemType> = {},
  ): Promise<ArrangedCart> {
    const { addItemsCart } = await shopper.graphql.execute(AddItemsCartDocument, {
      command: {
        ...(await shopper.storeContext()),
        cartName: uniqueId("test-cart"),
        cartItems: items.map((item) => ({ ...itemFields, ...item })),
      },
    });
    const cart = requireFields(addItemsCart, ["id"], "Arranged cart");
    await this.removeCartLater(shopper, cart.id);
    return cart;
  }

  /**
   * Removes a cart by id after the test, for carts the code under test creates; the shopper must own it.
   * Use {@link CartArrange#removeDefaultCartLater} when the id is not known up front.
   */
  async removeCartLater(shopper: ApiSession, cartId: string): Promise<void> {
    const { userId } = await shopper.storeContext();
    this.#cleanup.push(`remove cart ${cartId}`, () =>
      shopper.graphql.execute(RemoveCartDocument, { command: { cartId, userId } }),
    );
  }

  /**
   * Creates a uniquely named shopping list in the shopper's session and deletes it after the test
   * (unless already gone). Use {@link CartArrange#sharedList} for a shared one.
   *
   * @param items - None by default.
   */
  async shoppingList(shopper: ApiSession, items: readonly ItemToAdd[] = []): Promise<ArrangedShoppingList> {
    const listName = uniqueId("test-shopping-list");
    const { createWishlist } = await shopper.graphql.execute(CreateShoppingListDocument, {
      command: { ...(await shopper.storeContext()), listName, description: `Created by an automated test` },
    });
    const list = requireFields(createWishlist, ["id"], `Shopping list ${listName}`);
    this.#cleanup.push(`delete shopping list ${listName}`, async () => {
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

  /**
   * Adds items to the shopper's default cart (the one the frontend shows) and removes that cart after the test.
   * Use {@link CartArrange#cart} for a cart the frontend should not show.
   */
  async defaultCart(shopper: ApiSession, items: readonly ItemToAdd[]): Promise<ArrangedCart> {
    this.removeDefaultCartLater(shopper);
    const { addItemsCart } = await shopper.graphql.execute(AddItemsCartDocument, {
      command: { ...(await shopper.storeContext()), cartItems: [...items] },
    });
    return requireFields(addItemsCart, ["id"], "Default cart");
  }

  /**
   * Like {@link CartArrange#defaultCart}, plus the empty shipment and payment the frontend adds on its first visit
   * to the cart page. The page then starts no writes of its own, so a test can act on it right after it loads;
   * use this for tests that change the cart in the browser, such as applying a coupon.
   */
  async checkoutReadyCart(shopper: ApiSession, items: readonly ItemToAdd[]): Promise<ArrangedCart> {
    const cart = await this.defaultCart(shopper, items);
    const context = await shopper.storeContext();
    await shopper.graphql.execute(AddOrUpdateCartShipmentDocument, {
      command: { ...context, cartId: cart.id, shipment: {} },
    });
    const { addOrUpdateCartPayment } = await shopper.graphql.execute(AddOrUpdateCartPaymentDocument, {
      command: { ...context, cartId: cart.id, payment: {} },
    });
    return requireFields(addOrUpdateCartPayment, ["id"], "Checkout-ready cart");
  }

  /** Removes the shopper's default cart after the test, if it exists then; for carts the frontend creates. */
  removeDefaultCartLater(shopper: ApiSession): void {
    this.#cleanup.push("remove the shopper's default cart", async () => {
      const context = await shopper.storeContext();
      const { cart } = await shopper.graphql.execute(GetCartDocument, context);
      if (cart?.id) {
        await shopper.graphql.execute(RemoveCartDocument, { command: { cartId: cart.id, userId: context.userId } });
      }
    });
  }

  /**
   * Creates a shopping list with items via {@link CartArrange#shoppingList} and shares it; deleted after the test.
   *
   * @param scope - Who may open the list, such as `AnyoneAnonymous`.
   * @returns The list and the key used in its share link.
   */
  async sharedList(
    shopper: ApiSession,
    items: readonly ItemToAdd[],
    scope: string,
  ): Promise<{ readonly list: ArrangedShoppingList; readonly sharingKey: string }> {
    const list = await this.shoppingList(shopper, items);
    const { changeWishlist } = await shopper.graphql.execute(ChangeShoppingListDocument, {
      command: { listId: list.id, scope },
    });
    const sharing = requireFields(changeWishlist?.sharingSetting, ["id"], `Sharing of ${list.name}`);
    return { list, sharingKey: sharing.id };
  }

  /** Deletes all of the shopper's shopping lists in the store after the test, for lists the frontend creates. */
  deleteShoppingListsLater(shopper: ApiSession): void {
    this.#cleanup.push("delete the shopper's shopping lists", async () => {
      const { wishlists } = await shopper.graphql.execute(GetShoppingListsDocument, await shopper.storeContext());
      for (const list of wishlists?.items ?? []) {
        if (list?.id) {
          await shopper.graphql.execute(DeleteShoppingListDocument, { command: { listId: list.id } });
        }
      }
    });
  }
}
