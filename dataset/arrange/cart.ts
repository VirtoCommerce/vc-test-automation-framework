import type { CartFragment, InputNewCartItemType } from "@api/graphql/generated/graphql";
import type { GraphqlClient } from "@api/graphql/graphql-client";
import type { CleanupStack } from "@core/cleanup-stack";
import type { FrontendContext } from "../frontend-context";

import { AddItemsCartDocument, GetCartDocument, RemoveCartDocument } from "@api/graphql/generated/graphql";
import { requireFields } from "@core/required-fields";
import { uniqueId } from "@core/unique-id";

import { describeShopper } from "../frontend-context";

export interface CartScope {
  readonly storeId: string;
  readonly userId: string;
  readonly currencyCode: string;
  readonly cultureName: string;
}

export interface CartItem {
  readonly productId: string;
  readonly quantity: number;
}

export type ArrangedCart = CartFragment & { readonly id: string };

export function cartScope(context: FrontendContext): CartScope {
  return {
    storeId: context.storeId,
    userId: context.userId,
    currencyCode: context.currencyCode,
    cultureName: context.cultureName,
  };
}

export async function arrangeCart(
  graphqlClient: GraphqlClient,
  cleanupStack: CleanupStack,
  context: FrontendContext,
  items: readonly CartItem[],
  extraItemFields: Partial<InputNewCartItemType> = {},
): Promise<ArrangedCart> {
  const cartItems = items.map((item) => ({ ...extraItemFields, ...item }));
  const cart = await addItems(graphqlClient, context, cartItems, uniqueId("test-cart"));
  registerCartRemoval(graphqlClient, cleanupStack, context, cart.id);
  return cart;
}

export function addToDefaultCart(
  graphqlClient: GraphqlClient,
  context: FrontendContext,
  items: readonly CartItem[],
): Promise<ArrangedCart> {
  return addItems(graphqlClient, context, [...items], undefined);
}

export async function findDefaultCart(
  graphqlClient: GraphqlClient,
  context: FrontendContext,
): Promise<ArrangedCart | undefined> {
  const { cart } = await graphqlClient.execute(GetCartDocument, cartScope(context));
  return cart === null ? undefined : requireCart(cart, "Default cart");
}

export function registerDefaultCartRemoval(
  graphqlClient: GraphqlClient,
  cleanupStack: CleanupStack,
  context: FrontendContext,
): void {
  cleanupStack.push(`remove the default cart of ${describeShopper(context)}`, async () => {
    const cart = await findDefaultCart(graphqlClient, context);
    if (cart !== undefined) {
      await removeCart(graphqlClient, context, cart.id);
    }
  });
}

export function registerCartRemoval(
  graphqlClient: GraphqlClient,
  cleanupStack: CleanupStack,
  context: FrontendContext,
  cartId: string,
): void {
  cleanupStack.push(`remove cart ${cartId}`, () => removeCart(graphqlClient, context, cartId));
}

interface LineItemIdentity {
  readonly id?: string | null;
  readonly productId?: string | null;
}

export type IdentifiedLineItem<Item extends LineItemIdentity> = Item & {
  readonly id: string;
  readonly productId: string;
};

export function lineItemFor<Item extends LineItemIdentity>(
  cart: { readonly items?: readonly (Item | null)[] | null | undefined } | null | undefined,
  productId: string,
): IdentifiedLineItem<Item> {
  const lineItem = cart?.items?.find((item) => item?.productId === productId);
  return requireFields(lineItem, ["id", "productId"], `Line item of product "${productId}"`);
}

export function requireCart(cart: CartFragment | null | undefined, label: string): ArrangedCart {
  return requireFields(cart, ["id"], label);
}

async function addItems(
  graphqlClient: GraphqlClient,
  context: FrontendContext,
  cartItems: InputNewCartItemType[],
  cartName: string | undefined,
): Promise<ArrangedCart> {
  const { addItemsCart } = await graphqlClient.execute(AddItemsCartDocument, {
    command: { ...cartScope(context), cartItems, ...(cartName === undefined ? {} : { cartName }) },
  });
  return requireCart(
    addItemsCart,
    cartName === undefined ? `Default cart of ${describeShopper(context)}` : `Arranged cart ${cartName}`,
  );
}

async function removeCart(graphqlClient: GraphqlClient, context: FrontendContext, cartId: string): Promise<void> {
  await graphqlClient.execute(RemoveCartDocument, { command: { cartId, userId: context.userId } });
}
