import type {
  VirtoCommercePricingModuleCoreModelPricelist as Pricelist,
  VirtoCommercePricingModuleCoreModelPricelistAssignment as PricelistAssignment,
  VirtoCommercePricingModuleCoreModelProductPrice as ProductPrice,
} from "../rest/generated/platform.ts";

import { randomUUID } from "node:crypto";

import { uniqueId } from "../support/unique-id.ts";

/** A pricelist to create, with its identifier, name and currency. */
export type PricelistDraft = Pricelist & { readonly id: string; readonly name: string; readonly currency: string };

/** A pricelist assignment to create, with its identifier, name, pricelist and catalog. */
export type PricelistAssignmentDraft = PricelistAssignment & {
  readonly id: string;
  readonly name: string;
  readonly pricelistId: string;
  readonly catalogId: string;
};

/**
 * Returns a new pricelist.
 *
 * @param currency - The currency of the pricelist.
 * @returns The pricelist, with a unique name.
 */
export function newPricelist(currency: string): PricelistDraft {
  return { id: randomUUID(), name: uniqueId("test-pricelist"), currency };
}

/**
 * Returns the list price of a product in a pricelist, from a quantity of one.
 *
 * @param pricelist - The pricelist, with its currency.
 * @param productId - The identifier of the product.
 * @param list - The list price.
 * @returns The price of the product.
 */
export function newProductPrice(
  pricelist: { readonly id: string; readonly currency: string },
  productId: string,
  list: number,
): ProductPrice & { readonly productId: string } {
  return {
    productId,
    prices: [{ pricelistId: pricelist.id, productId, list, minQuantity: 1, currency: pricelist.currency }],
  };
}

/**
 * Returns a new assignment of a pricelist to a catalog.
 *
 * @param pricelistId - The pricelist to assign.
 * @param catalogId - The catalog that the pricelist prices.
 * @returns The assignment, with a unique name.
 */
export function newPricelistAssignment(pricelistId: string, catalogId: string): PricelistAssignmentDraft {
  return { id: randomUUID(), name: uniqueId("test-assignment"), pricelistId, catalogId };
}
