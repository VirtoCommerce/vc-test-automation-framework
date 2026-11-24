import type { PricelistAssignmentDraft, PricelistDraft } from "../builders/pricing.ts";
import type { ArrangeContext } from "./context.ts";

import { newPricelist, newPricelistAssignment, newProductPrice } from "../builders/pricing.ts";

/** Arranges pricelists, prices and pricelist assignments. */
export interface PricingArrange {
  /** Creates a pricelist in the default currency of the store and deletes it after the test. */
  pricelist(): Promise<PricelistDraft>;
  /** Sets the list price of a product in a pricelist; it is deleted with the pricelist. */
  price(pricelist: PricelistDraft, productId: string, list: number): Promise<void>;
  /** Assigns a pricelist to the catalog of the store and deletes the assignment after the test. */
  pricelistAssignment(pricelistId: string): Promise<PricelistAssignmentDraft>;
  /** Deletes a pricelist after the test, such as one that the code under test creates. */
  deletePricelistLater(pricelistId: string): void;
  /** Deletes a pricelist assignment after the test, such as one that the code under test creates. */
  deletePricelistAssignmentLater(assignmentId: string): void;
}

const PRICELISTS_PATH = "/api/pricing/pricelists";
const ASSIGNMENTS_PATH = "/api/pricing/assignments";

/**
 * Returns the pricing methods of `arrange`.
 *
 * @param context - What the methods create and remove data with.
 * @returns The methods.
 */
export function pricingArrange({ admin, store, later }: ArrangeContext): PricingArrange {
  async function pricelist(): Promise<PricelistDraft> {
    const draft = newPricelist(store.defaultCurrency);
    (await (await admin()).post(PRICELISTS_PATH, { json: draft })).expectOk();
    deletePricelistLater(draft.id);
    return draft;
  }

  async function price(arranged: PricelistDraft, productId: string, list: number): Promise<void> {
    const json = [newProductPrice(arranged, productId, list)];
    (await (await admin()).put("/api/products/prices", { json })).expectOk();
  }

  async function pricelistAssignment(pricelistId: string): Promise<PricelistAssignmentDraft> {
    const draft = newPricelistAssignment(pricelistId, store.catalog);
    (await (await admin()).post(ASSIGNMENTS_PATH, { json: draft })).expectOk();
    deletePricelistAssignmentLater(draft.id);
    return draft;
  }

  function deletePricelistLater(pricelistId: string): void {
    later(`delete pricelist ${pricelistId}`, async () =>
      (await (await admin()).delete(PRICELISTS_PATH, { query: { ids: [pricelistId] } })).expectOk(),
    );
  }

  function deletePricelistAssignmentLater(assignmentId: string): void {
    later(`delete pricelist assignment ${assignmentId}`, async () =>
      (await (await admin()).delete(ASSIGNMENTS_PATH, { query: { ids: [assignmentId] } })).expectOk(),
    );
  }

  return { pricelist, price, pricelistAssignment, deletePricelistLater, deletePricelistAssignmentLater };
}
