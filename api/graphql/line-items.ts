import { requireFields } from "@core/required-fields";

interface LineItem {
  readonly id?: string | null;
  readonly productId?: string | null;
}

/** Anything with line items: cart, quote, saved-for-later list, shopping list. */
interface WithLineItems<Item extends LineItem> {
  readonly items?: readonly (Item | null)[] | null;
}

/**
 * Finds the first line item of a product in a cart, quote or list, typed with `id` and `productId` present.
 *
 * @example
 * const line = lineItemOf(cart, laptop.id);
 * await api.graphql.execute(RemoveCartItemDocument, { command: { ...context, cartId: cart.id, lineItemId: line.id } });
 *
 * @throws Error when the container has no line for the product.
 */
export function lineItemOf<Item extends LineItem>(
  container: WithLineItems<Item> | null | undefined,
  productId: string,
): Item & { readonly id: string; readonly productId: string } {
  const line = container?.items?.find((item) => item?.productId === productId);
  return requireFields(line, ["id", "productId"], `Line item of product "${productId}"`);
}
