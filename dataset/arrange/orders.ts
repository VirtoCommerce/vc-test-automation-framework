import type { ApiSession } from "@api/api-session";
import type { QuoteFragment } from "@api/graphql/generated/graphql";
import type { CustomerOrder } from "@api/rest/types/orders";
import type { CleanupStack } from "@core/cleanup-stack";
import type { Dataset } from "../dataset";
import type { StoreUnderTest } from "../store-under-test";
import type { ArrangeContext } from "./context";

import { CreateQuoteFromCartDocument } from "@api/graphql/generated/graphql";
import { requireFields } from "@core/required-fields";

import { newLineItem, newOrder } from "../builders/order";

/** Order line: a dataset product at a unit price. */
export interface OrderLine {
  readonly productId: string;
  readonly price: number;
}

/** Quote as xAPI returns it, with a guaranteed id. */
export type ArrangedQuote = QuoteFragment & { readonly id: string };

/** Arranges customer orders and quotes, and removes the ones the code under test creates. */
export class OrderArrange {
  readonly #admin: ApiSession;
  readonly #cleanup: CleanupStack;
  readonly #dataset: Dataset;
  readonly #store: StoreUnderTest;

  constructor({ admin, cleanup, dataset, store }: ArrangeContext) {
    this.#admin = admin;
    this.#cleanup = cleanup;
    this.#dataset = dataset;
    this.#store = store;
  }

  /**
   * Creates an order in the store's default currency, with the administrator as customer, and deletes it after
   * the test. For orders the frontend places, use {@link OrderArrange#deleteOrdersOfLater}.
   *
   * @param lines - Dataset products at unit prices; none by default.
   */
  async order(lines: readonly OrderLine[] = []): Promise<CustomerOrder> {
    const { orders } = this.#admin.rest;
    const currency = this.#store.defaultCurrency;
    const items = lines.map(({ productId, price }) =>
      newLineItem(
        requireFields(this.#dataset.products.get(productId), ["id", "code", "name", "catalogId"], productId),
        price,
        currency,
      ),
    );
    const customer = {
      id: (await this.#admin.storeContext()).userId,
      userName: requireFields(this.#admin.credentials, ["username"], "Administrator credentials").username,
    };
    const draft = newOrder({ id: this.#store.id, currency }, customer, items);
    return this.#cleanup.track(
      `delete order ${draft.number}`,
      () => orders.delete([draft.id]),
      () => orders.create(draft),
    );
  }

  /**
   * Deletes an order by id after the test, for orders the code under test creates.
   * Use {@link OrderArrange#deleteOrdersOfLater} when the id is not known up front.
   */
  deleteOrderLater(orderId: string): void {
    this.#cleanup.push(`delete order ${orderId}`, () => this.#admin.rest.orders.delete([orderId]));
  }

  /**
   * Deletes all orders of a customer after the test, for orders the frontend places.
   *
   * @param customerId - A user id, or an anonymous shopper's id.
   */
  deleteOrdersOfLater(customerId: string): void {
    const { orders } = this.#admin.rest;
    this.#cleanup.push(`delete the orders of ${customerId}`, async () => {
      const placed = await orders.search({ customerIds: [customerId] });
      if (placed.length > 0) {
        await orders.delete(placed.map(({ id }) => id));
      }
    });
  }

  /**
   * Creates a draft quote from the shopper's cart in their session; the quote is deleted after the test.
   *
   * @returns The draft quote.
   */
  async quoteFromCart(shopper: ApiSession, cartId: string): Promise<ArrangedQuote> {
    const { createQuoteFromCart } = await shopper.graphql.execute(CreateQuoteFromCartDocument, {
      command: { cartId, comment: "Quote requested by an automated test" },
    });
    const quote = requireFields(createQuoteFromCart, ["id"], "Quote from cart");
    this.deleteQuoteLater(quote.id);
    return quote;
  }

  /** Deletes a quote by id after the test, for quotes the code under test creates. */
  deleteQuoteLater(quoteId: string): void {
    this.#cleanup.push(`delete quote ${quoteId}`, () => this.#admin.rest.quotes.delete([quoteId]));
  }
}
