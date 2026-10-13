import type { PriceData, PricelistAssignmentData, PricelistData, ProductPriceData } from "@api/rest/types/pricing";
import type { WithRequired } from "@core/required-fields";

import { randomUUID } from "node:crypto";

import { uniqueId } from "@core/unique-id";

/** A pricelist to create, with a unique name. */
export type PricelistDraft = WithRequired<PricelistData, "id" | "name" | "currency">;

/** A pricelist assignment to create, with a unique name. */
export type PricelistAssignmentDraft = WithRequired<
  PricelistAssignmentData,
  "id" | "name" | "pricelistId" | "catalogId"
>;

/**
 * Builds a pricelist named `test-pricelist-…`.
 *
 * @param currency - Such as `USD`.
 */
export function newPricelist(currency: string): PricelistDraft {
  return { id: randomUUID(), name: uniqueId("test-pricelist"), currency };
}

/**
 * Builds a product's prices as the price endpoints take them: one list price from quantity 1,
 * in the pricelist's currency.
 */
export function newProductPrice(
  pricelist: { readonly id: string; readonly currency: string },
  productId: string,
  list: number,
): ProductPriceData & { productId: string } {
  const price: PriceData = { pricelistId: pricelist.id, productId, list, minQuantity: 1, currency: pricelist.currency };
  return { productId, prices: [price] };
}

/**
 * Builds an assignment named `test-assignment-…` of a pricelist to a catalog.
 *
 * @param catalogId - The catalog whose products get the prices, such as the store's catalog.
 */
export function newPricelistAssignment(pricelistId: string, catalogId: string): PricelistAssignmentDraft {
  return { id: randomUUID(), name: uniqueId("test-assignment"), pricelistId, catalogId };
}
