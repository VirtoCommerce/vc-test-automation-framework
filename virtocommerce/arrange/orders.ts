import type { CustomerOrderDraft } from "../builders/order.ts";
import type { QuoteFragment } from "../graphql/generated/graphql.ts";
import type { VirtoCommerceOrdersModuleCoreModelSearchCustomerOrderSearchResult as CustomerOrderSearchResult } from "../rest/generated/platform.ts";
import type { WithRequired } from "../support/require-fields.ts";
import type { ArrangeContext } from "./context.ts";
import type { Shopper } from "./shopper.ts";

import { GraphqlClient } from "@virtocommerce/test-automation-framework/graphql";

import { newLineItem, newOrder } from "../builders/order.ts";
import { dataset } from "../dataset/index.ts";
import { CreateQuoteFromCartDocument, GetMeDocument } from "../graphql/generated/graphql.ts";
import { requireFields } from "../support/require-fields.ts";

/** A quote as xAPI returns it, with its identifier. */
export type ArrangedQuote = WithRequired<QuoteFragment, "id">;

/** A line item of an order: a product of the dataset and its unit price. */
export interface OrderLine {
  readonly productId: string;
  readonly price: number;
}

/** Arranges customer orders and quotes. */
export interface OrdersArrange {
  /**
   * Creates a new order of the store under test, placed by the store administrator, and deletes it after the test.
   *
   * @param lines - One unit of each product at its price; none by default.
   */
  order(lines?: readonly OrderLine[]): Promise<CustomerOrderDraft>;
  /** Creates a draft quote from a cart of the shopper and deletes it after the test. */
  quoteFromCart(shopper: Shopper, cartId: string): Promise<ArrangedQuote>;
  /** Deletes a quote after the test, such as one that the code under test creates. */
  deleteQuoteLater(quoteId: string): void;
  /** Deletes an order after the test, such as one that the code under test places. */
  deleteOrderLater(orderId: string): void;
  /**
   * Deletes every order of a customer after the test, such as the orders that the frontend places.
   *
   * @param customerId - The identifier of a user, or of an anonymous visitor.
   */
  deleteOrdersOfLater(customerId: string): void;
}

const CUSTOMER_ORDERS_PATH = "/api/order/customerOrders";
const QUOTE_REQUESTS_PATH = "/api/quote/requests";

/**
 * Returns the order and quote methods of `arrange`.
 *
 * @param context - What the methods create and remove data with.
 * @returns The methods.
 */
export function ordersArrange({ admin, store, later }: ArrangeContext): OrdersArrange {
  async function order(lines: readonly OrderLine[] = []): Promise<CustomerOrderDraft> {
    const client = await admin();
    const currency = store.defaultCurrency;
    const items = lines.map(({ productId, price }) =>
      newLineItem(
        requireFields(dataset.products.get(productId), ["id", "code", "name", "catalogId"], productId),
        price,
        currency,
      ),
    );
    const { me } = await new GraphqlClient(client).execute(GetMeDocument);
    const customer = requireFields(me, ["id", "userName"], "The store administrator");
    const draft = newOrder({ id: store.id, currency }, { id: customer.id, userName: customer.userName }, items);
    (await client.post(CUSTOMER_ORDERS_PATH, { json: draft })).expectOk();
    deleteOrderLater(draft.id);
    return draft;
  }

  async function quoteFromCart(shopper: Shopper, cartId: string): Promise<ArrangedQuote> {
    const { createQuoteFromCart } = await shopper.graphql.execute(CreateQuoteFromCartDocument, {
      command: { cartId, comment: "Quote requested by an automated test" },
    });
    const quote = requireFields(createQuoteFromCart, ["id"], `The quote from cart ${cartId}`);
    deleteQuoteLater(quote.id);
    return quote;
  }

  function deleteQuoteLater(quoteId: string): void {
    later(`delete quote ${quoteId}`, async () =>
      (await (await admin()).delete(QUOTE_REQUESTS_PATH, { query: { ids: [quoteId] } })).expectOk(),
    );
  }

  function deleteOrderLater(orderId: string): void {
    later(`delete order ${orderId}`, async () =>
      (await (await admin()).delete(CUSTOMER_ORDERS_PATH, { query: { ids: [orderId] } })).expectOk(),
    );
  }

  function deleteOrdersOfLater(customerId: string): void {
    later(`delete the orders of ${customerId}`, async () => {
      const client = await admin();
      const { results } = (await client.post(`${CUSTOMER_ORDERS_PATH}/search`, { json: { customerIds: [customerId] } }))
        .expectOk()
        .json<CustomerOrderSearchResult>();
      const ids = (results ?? []).flatMap(({ id }) => (typeof id === "string" ? [id] : []));
      if (ids.length > 0) {
        (await client.delete(CUSTOMER_ORDERS_PATH, { query: { ids } })).expectOk();
      }
    });
  }

  return { order, quoteFromCart, deleteQuoteLater, deleteOrderLater, deleteOrdersOfLater };
}
