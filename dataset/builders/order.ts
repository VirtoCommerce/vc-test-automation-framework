import type { CustomerOrder, CustomerOrderData, OrderLineItemData } from "@api/rest/types/orders";
import type { WithRequired } from "@core/required-fields";

import { randomUUID } from "node:crypto";

/** The longest order number the platform accepts. */
export const MAX_ORDER_NUMBER_LENGTH = 64;

/** An order to create, with its id and number chosen up front. */
export type CustomerOrderDraft = WithRequired<CustomerOrderData, "id" | "number" | "items">;

/** Who an order is placed for. */
export interface OrderCustomer {
  readonly id: string;
  readonly userName: string;
}

/** The product a line item is for, as the catalog describes it. */
export interface OrderedProduct {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly catalogId: string;
}

/**
 * Builds a `New` order with a random id and a unique `TEST-<8 hex>` number, in the store's currency.
 *
 * @param items - None by default; see {@link newLineItem}.
 */
export function newOrder(
  store: { readonly id: string; readonly currency: string },
  customer: OrderCustomer,
  items: readonly OrderLineItemData[] = [],
): CustomerOrderDraft {
  const id = randomUUID();
  return {
    id,
    number: `TEST-${id.slice(0, 8).toUpperCase()}`,
    storeId: store.id,
    customerId: customer.id,
    customerName: customer.userName,
    currency: store.currency,
    status: "New",
    items: [...items],
  };
}

/**
 * Builds a line item for one unit of a physical product, with a random id; its SKU is the product code.
 *
 * @param price - The unit price.
 */
export function newLineItem(product: OrderedProduct, price: number, currency: string): OrderLineItemData {
  return {
    id: randomUUID(),
    productId: product.id,
    sku: product.code,
    name: product.name,
    catalogId: product.catalogId,
    productType: "Physical",
    currency,
    price,
    quantity: 1,
  };
}

/**
 * Copies an order with a new quantity on its only line item, for recalculating it.
 *
 * @throws Error when the order does not have exactly one line item.
 */
export function withQuantity(order: CustomerOrder, quantity: number): CustomerOrder {
  const [item, ...others] = order.items;
  if (item === undefined || others.length > 0) {
    throw new Error(`Order ${order.number} has ${order.items.length} line items, expected one`);
  }
  return { ...order, items: [{ ...item, quantity }] };
}
