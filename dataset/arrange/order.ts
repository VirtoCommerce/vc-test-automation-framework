import type { OrdersClient } from "@api/rest/clients/orders-client";
import type { CustomerOrder } from "@api/rest/types/orders";
import type { CleanupStack } from "@core/cleanup-stack";
import type { CustomerOrderDraft } from "../builders/order";

export async function arrangeOrder(
  ordersClient: OrdersClient,
  cleanupStack: CleanupStack,
  draft: CustomerOrderDraft,
): Promise<CustomerOrder> {
  cleanupStack.push(`delete order ${draft.number}`, () => ordersClient.delete(draft.id));
  return ordersClient.create(draft);
}

export function registerCustomerOrdersRemoval(
  ordersClient: OrdersClient,
  cleanupStack: CleanupStack,
  customerId: string,
): void {
  cleanupStack.push(`delete the orders of customer ${customerId}`, async () => {
    for (const { id } of await ordersClient.search({ customerIds: [customerId] })) {
      await ordersClient.delete(id);
    }
  });
}
