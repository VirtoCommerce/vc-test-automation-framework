import type { HttpClient } from "../../http/http-client";
import type {
  CustomerOrder,
  CustomerOrderChangesSearchCriteria,
  CustomerOrderData,
  CustomerOrderSearchCriteria,
  OrderShipment,
  PaymentIn,
} from "../types/orders";
import type { OperationLog } from "../types/platform";

import { requireFields } from "@core/required-fields";

import { CUSTOMER_ORDER, ORDER_SHIPMENT, PAYMENT_IN } from "../types/orders";
import { OPERATION_LOG } from "../types/platform";

const CUSTOMER_ORDERS_PATH = "/api/order/customerOrders";

export class OrdersClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async get(id: string): Promise<CustomerOrder> {
    return requireFields(await this.find(id), CUSTOMER_ORDER.fields, `Order "${id}"`);
  }

  /** Finds an order; `undefined` when missing (the platform answers 404, not 200 with `null`). */
  async find(id: string): Promise<CustomerOrder | undefined> {
    return this.#fetch(`${CUSTOMER_ORDERS_PATH}/${encodeURIComponent(id)}`);
  }

  async getByNumber(number: string): Promise<CustomerOrder> {
    const order = await this.#fetch(`${CUSTOMER_ORDERS_PATH}/number/${encodeURIComponent(number)}`);
    return requireFields(order, CUSTOMER_ORDER.fields, `Order ${number}`);
  }

  async create(order: CustomerOrderData): Promise<CustomerOrder> {
    const response = await this.#httpClient.post(CUSTOMER_ORDERS_PATH, { json: order });
    return response.record(CUSTOMER_ORDER);
  }

  async update(order: CustomerOrderData): Promise<void> {
    (await this.#httpClient.put(CUSTOMER_ORDERS_PATH, { json: order })).expectOk();
  }

  async recalculate(order: CustomerOrderData): Promise<CustomerOrder> {
    const response = await this.#httpClient.put(`${CUSTOMER_ORDERS_PATH}/recalculate`, { json: order });
    return response.record(CUSTOMER_ORDER);
  }

  async search(criteria: CustomerOrderSearchCriteria): Promise<CustomerOrder[]> {
    const response = await this.#httpClient.post(`${CUSTOMER_ORDERS_PATH}/search`, { json: criteria });
    return response.results(CUSTOMER_ORDER);
  }

  async isIndexedSearchEnabled(): Promise<boolean> {
    const response = await this.#httpClient.get(`${CUSTOMER_ORDERS_PATH}/indexed/searchEnabled`);
    return response.json<{ result: boolean }>().result;
  }

  async paymentTemplate(orderId: string): Promise<PaymentIn> {
    const response = await this.#httpClient.get(`${CUSTOMER_ORDERS_PATH}/${encodeURIComponent(orderId)}/payments/new`);
    return response.record(PAYMENT_IN);
  }

  async shipmentTemplate(orderId: string): Promise<OrderShipment> {
    const path = `${CUSTOMER_ORDERS_PATH}/${encodeURIComponent(orderId)}/shipments/new`;
    const response = await this.#httpClient.get(path);
    return response.record(ORDER_SHIPMENT);
  }

  async searchChanges(criteria: CustomerOrderChangesSearchCriteria): Promise<OperationLog[]> {
    const response = await this.#httpClient.post(`${CUSTOMER_ORDERS_PATH}/searchChanges`, { json: criteria });
    return response.results(OPERATION_LOG);
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(CUSTOMER_ORDERS_PATH, { query: { ids } })).expectOk();
  }

  async #fetch(path: string): Promise<CustomerOrder | undefined> {
    const response = await this.#httpClient.get(path);
    return response.optionalRecord(CUSTOMER_ORDER, { allow404: true });
  }
}
