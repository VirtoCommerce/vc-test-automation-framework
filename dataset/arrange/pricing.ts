import type { ApiSession } from "@api/api-session";
import type { Pricelist, PricelistAssignment } from "@api/rest/types/pricing";
import type { CleanupStack } from "@core/cleanup-stack";
import type { StoreUnderTest } from "../store-under-test";
import type { ArrangeContext } from "./context";

import { newPricelist, newPricelistAssignment, newProductPrice } from "../builders/pricing";

/** Arranges pricelists, their prices and their assignments to the store's catalog. */
export class PricingArrange {
  readonly #admin: ApiSession;
  readonly #cleanup: CleanupStack;
  readonly #store: StoreUnderTest;

  constructor({ admin, cleanup, store }: ArrangeContext) {
    this.#admin = admin;
    this.#cleanup = cleanup;
    this.#store = store;
  }

  /**
   * Creates an empty pricelist in the store's default currency and deletes it, with its prices, after the test.
   * Add prices with {@link PricingArrange#price}; it applies to the store only after
   * {@link PricingArrange#pricelistAssignment}.
   */
  async pricelist(): Promise<Pricelist> {
    const { pricelists } = this.#admin.rest.pricing;
    const draft = newPricelist(this.#store.defaultCurrency);
    this.#cleanup.push(`delete pricelist ${draft.name}`, () => pricelists.delete([draft.id]));
    return pricelists.create(draft);
  }

  /**
   * Sets a product's list price in a pricelist from {@link PricingArrange#pricelist}; it is removed with that
   * pricelist.
   */
  async price(pricelist: Pricelist, productId: string, list: number): Promise<void> {
    await this.#admin.rest.pricing.prices.saveMany([newProductPrice(pricelist, productId, list)]);
  }

  /** Assigns a pricelist to the store's catalog and deletes the assignment after the test. */
  async pricelistAssignment(pricelistId: string): Promise<PricelistAssignment> {
    const { assignments } = this.#admin.rest.pricing;
    const draft = newPricelistAssignment(pricelistId, this.#store.catalog);
    this.#cleanup.push(`delete pricelist assignment ${draft.name}`, () => assignments.delete([draft.id]));
    return assignments.create(draft);
  }
}
