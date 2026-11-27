import { requireFields } from "../support/require-fields.ts";

interface LineItem {
  readonly id?: string | null;
  readonly productId?: string | null;
}

interface WithLineItems<Item extends LineItem> {
  readonly items?: readonly (Item | null)[] | null;
}

/**
 * Returns the first line item of a product in a cart, a saved-for-later list or a shopping list.
 *
 * @example
 * const line = lineItemOf(cart, PRODUCT_ID);
 *
 * @param container - The cart or list.
 * @param productId - The identifier of the product.
 * @returns The line item, typed with its `id` and `productId`.
 * @throws {Error} The cart or list has no line item of the product.
 */
export function lineItemOf<Item extends LineItem>(
  container: WithLineItems<Item> | null | undefined,
  productId: string,
): Item & { readonly id: string; readonly productId: string } {
  const line = container?.items?.find((item) => item?.productId === productId);
  return requireFields(line, ["id", "productId"], `Line item of product "${productId}"`);
}
