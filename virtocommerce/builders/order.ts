import type {
  VirtoCommerceOrdersModuleCoreModelCustomerOrder as CustomerOrder,
  OrderLineItem,
} from "../rest/generated/platform.ts";

import { randomUUID } from "node:crypto";

/** The longest order number that the platform accepts. */
export const MAX_ORDER_NUMBER_LENGTH = 64;

/** An order to create, with its identifier, number and line items. */
export type CustomerOrderDraft = CustomerOrder & {
  readonly id: string;
  readonly number: string;
  readonly items: OrderLineItem[];
};

/** The customer of an order. */
interface OrderCustomer {
  readonly id: string;
  readonly userName: string;
}

/** A product of the dataset as an order line item needs it. */
interface OrderedProduct {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly catalogId: string;
}

/**
 * Returns a new order of a store.
 *
 * @param store - The store and its currency.
 * @param customer - The customer of the order.
 * @param items - The line items; none by default.
 * @returns The order, with a unique number.
 */
export function newOrder(
  store: { readonly id: string; readonly currency: string },
  customer: OrderCustomer,
  items: readonly OrderLineItem[] = [],
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
 * Returns a line item of one unit of a product.
 *
 * @param product - The product.
 * @param price - The price of the unit.
 * @param currency - The currency of the order.
 * @returns The line item.
 */
export function newLineItem(product: OrderedProduct, price: number, currency: string): OrderLineItem {
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
 * Returns an order of one line item with another quantity.
 *
 * @param order - The order.
 * @param quantity - The new quantity.
 * @returns The changed order.
 * @throws {Error} The order does not have exactly one line item.
 */
export function withQuantity(order: CustomerOrder, quantity: number): CustomerOrder {
  const [item, ...others] = order.items ?? [];
  if (item === undefined || others.length > 0) {
    throw new Error(`Order ${order.number} has ${order.items?.length ?? 0} line items, expected one`);
  }
  return { ...order, items: [{ ...item, quantity }] };
}
