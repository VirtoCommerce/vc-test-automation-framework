import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type CustomerOrderChangesSearchCriteria =
  Rest.VirtoCommerceOrdersModuleCoreModelSearchCustomerOrderHistorySearchCriteria;
export type CustomerOrderData = Rest.VirtoCommerceOrdersModuleCoreModelCustomerOrder;
export type CustomerOrderSearchCriteria = Rest.VirtoCommerceOrdersModuleCoreModelSearchCustomerOrderSearchCriteria;
export type CustomerOrderSearchResult = Rest.VirtoCommerceOrdersModuleCoreModelSearchCustomerOrderSearchResult;
export type OrderLineItemData = Rest.OrderLineItem;
export type OrderShipmentData = Rest.OrderShipment;
export type PaymentInData = Rest.VirtoCommerceOrdersModuleCoreModelPaymentIn;

export const CUSTOMER_ORDER = shape<CustomerOrderData>()("Customer order", [
  "id",
  "number",
  "status",
  "storeId",
  "customerId",
  "items",
]);
export type CustomerOrder = Shaped<typeof CUSTOMER_ORDER>;
export const PAYMENT_IN = shape<PaymentInData>()("Payment in", ["number"]);
export type PaymentIn = Shaped<typeof PAYMENT_IN>;
export const ORDER_SHIPMENT = shape<OrderShipmentData>()("Order shipment", ["number"]);
export type OrderShipment = Shaped<typeof ORDER_SHIPMENT>;
