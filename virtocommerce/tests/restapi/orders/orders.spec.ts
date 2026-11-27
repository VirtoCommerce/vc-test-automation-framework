import type {
  VirtoCommerceOrdersModuleCoreModelCustomerOrder as CustomerOrder,
  VirtoCommerceOrdersModuleCoreModelSearchCustomerOrderSearchResult as CustomerOrderSearchResult,
  VirtoCommerceSearchModuleCoreModelIndexState as IndexState,
  VirtoCommercePlatformCoreChangeLogOperationLog as OperationLog,
  OrderShipment,
  VirtoCommerceOrdersModuleCoreModelPaymentIn as PaymentIn,
} from "@rest/generated/platform.ts";
import type { GraphqlClient } from "@virtocommerce/test-automation-framework/graphql";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { randomUUID } from "node:crypto";

import { MAX_ORDER_NUMBER_LENGTH, newOrder, withQuantity } from "@builders/order.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { GetMeDocument } from "@graphql/generated/graphql.ts";
import { requireFields } from "@support/require-fields.ts";

const ORDERS_PATH = "/api/order/customerOrders";
const PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";
const PRICE = 100;
const ORDER_INDEX = "CustomerOrder";
const CHANGE_LOG_TIMEOUT_MS = 30_000;
const DOCUMENT_TEMPLATES = [
  {
    document: "payment",
    path: "payments",
    expected: (order: CustomerOrder) => ({ operationType: "PaymentIn", customerId: order.customerId }),
    number: /^PI\d{6}-\d{5}$/,
  },
  {
    document: "shipment",
    path: "shipments",
    expected: () => ({ operationType: "Shipment" }),
    number: /^SH\d{6}-\d{5}$/,
  },
] as const;

test.describe("customer orders (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("create an order", async ({ api, graphql, arrange, store }) => {
    const draft = newOrder({ id: store.id, currency: store.defaultCurrency }, await customerOf(graphql));
    arrange.orders.deleteOrderLater(draft.id);

    const order = await test.step("act: create an order", async () =>
      (await api.post(ORDERS_PATH, { json: draft })).expectOk().json<CustomerOrder>());

    await test.step("assert: the order is new, in the store", () => {
      expect(order).toMatchObject({ id: draft.id, number: draft.number, status: "New", storeId: store.id });
    });
  });

  test(`reject an order number longer than ${MAX_ORDER_NUMBER_LENGTH} characters`, async ({
    api,
    graphql,
    arrange,
    store,
  }) => {
    const draft = {
      ...newOrder({ id: store.id, currency: store.defaultCurrency }, await customerOf(graphql)),
      number: "X".repeat(MAX_ORDER_NUMBER_LENGTH + 1),
    };
    arrange.orders.deleteOrderLater(draft.id);

    const response = await test.step("act: create the order", () => api.post(ORDERS_PATH, { json: draft }));

    await test.step("assert: creating the order is rejected", () => {
      expect(response.status).toBe(400);
      expect(response.text).toContain(`must be ${MAX_ORDER_NUMBER_LENGTH} characters or fewer`);
    });
  });

  test("get an order by id", async ({ api, arrange }) => {
    const order = await test.step("arrange: an order", () => arrange.orders.order());

    const reloaded = await test.step("act: get the order", () => orderOf(api, order.id));

    await test.step("assert: the fields match the created order", () => {
      expect(reloaded).toMatchObject({ id: order.id, number: order.number, storeId: order.storeId });
    });
  });

  test("get an order by number", async ({ api, arrange }) => {
    const order = await test.step("arrange: an order", () => arrange.orders.order());

    const reloaded = await test.step(`act: get order ${order.number}`, async () =>
      (await api.get(`${ORDERS_PATH}/number/${order.number}`)).expectOk().json<CustomerOrder>());

    await test.step("assert: the same order is returned", () => {
      expect(reloaded).toMatchObject({ id: order.id, number: order.number });
    });
  });

  test("get a missing order", async ({ api }) => {
    const order = await test.step("act: look an order up by an unknown id", () => orderOf(api, randomUUID()));

    await test.step("assert: no order is found", () => {
      expect(order).toBeUndefined();
    });
  });

  test("search orders by number", async ({ api, arrange }) => {
    const order = await test.step("arrange: an order", () => arrange.orders.order());

    const found = await test.step(`act: search orders by ${order.number}`, () =>
      searchOrders(api, { keyword: order.number }));

    await test.step("assert: the order is found", () => {
      expect(found.map(({ id }) => id)).toContain(order.id);
    });
  });

  test("sort orders by created date, newest first", async ({ api, arrange }) => {
    const older = await test.step("arrange: an order", () => arrange.orders.order());
    const newer = await test.step("arrange: a newer order", () => arrange.orders.order());

    const found = await test.step("act: search both orders, newest first", () =>
      searchOrders(api, { ids: [older.id, newer.id], sort: "createdDate:desc" }));

    await test.step("assert: the newer order comes first", () => {
      expect(found.map(({ id }) => id)).toEqual([newer.id, older.id]);
    });
  });

  test("indexed order search is enabled with the order index registered", async ({ api }) => {
    const enabled = await test.step("act: ask whether indexed order search is enabled", async () =>
      (await api.get(`${ORDERS_PATH}/indexed/searchEnabled`)).expectOk().json<{ result?: boolean }>().result);

    await test.step(`assert: it is, and the ${ORDER_INDEX} index is registered`, async () => {
      expect(enabled).toBe(true);
      const indexes = (await api.get("/api/search/indexes")).expectOk().json<IndexState[]>();
      expect(indexes.map(({ documentType }) => documentType)).toContain(ORDER_INDEX);
    });
  });

  for (const { document, path, expected, number } of DOCUMENT_TEMPLATES) {
    test(`get a new ${document} for an order`, async ({ api, arrange }) => {
      const order = await test.step("arrange: an order with a line item", () =>
        arrange.orders.order([{ productId: PRODUCT_ID, price: PRICE }]));

      const created = await test.step(`act: get a new ${document}`, async () =>
        (await api.get(`${ORDERS_PATH}/${order.id}/${path}/new`)).expectOk().json<PaymentIn | OrderShipment>());

      await test.step(`assert: the ${document} is new, numbered and in the order's currency`, () => {
        expect(created).toMatchObject({ ...expected(order), status: "New", currency: order.currency });
        expect(created.number).toMatch(number);
      });
    });
  }

  test("change the status of an order", async ({ api, arrange }) => {
    const order = await test.step("arrange: an order", () => arrange.orders.order());
    const saved = requireFields(await orderOf(api, order.id), ["id"], `Order ${order.number}`);

    await test.step("act: set the status to Processing", async () =>
      (await api.put(ORDERS_PATH, { json: { ...saved, status: "Processing" } })).expectOk());

    await test.step("assert: the order is processing", async () => {
      expect((await orderOf(api, order.id))?.status).toBe("Processing");
    });
  });

  test("recalculate the totals of an order after a quantity change", async ({ api, arrange }) => {
    const order = await test.step(`arrange: an order of one item at ${PRICE}`, () =>
      arrange.orders.order([{ productId: PRODUCT_ID, price: PRICE }]));
    const saved = requireFields(await orderOf(api, order.id), ["id"], `Order ${order.number}`);

    const recalculated = await test.step("act: recalculate the order with quantity 2", () =>
      recalculate(api, withQuantity(saved, 2)));

    await test.step(`assert: the total is ${PRICE * 2}`, () => {
      expect(recalculated.items).toEqual([expect.objectContaining({ quantity: 2, price: PRICE })]);
      expect(recalculated.total).toBe(PRICE * 2);
    });
  });

  test("save an order with a payment, a shipment and a new quantity", async ({ api, arrange }) => {
    const order = await test.step("arrange: an order with a line item", () =>
      arrange.orders.order([{ productId: PRODUCT_ID, price: PRICE }]));
    const saved = requireFields(await orderOf(api, order.id), ["id"], `Order ${order.number}`);
    const changesBefore = await test.step("arrange: the order's change log", () => changesOf(api, order.id));
    const payment = await test.step("arrange: a new payment", async () =>
      (await api.get(`${ORDERS_PATH}/${order.id}/payments/new`)).expectOk().json<PaymentIn>());
    const shipment = await test.step("arrange: a new shipment", async () =>
      (await api.get(`${ORDERS_PATH}/${order.id}/shipments/new`)).expectOk().json<OrderShipment>());
    const recalculated = await test.step("arrange: the order recalculated with them and quantity 2", () =>
      recalculate(api, { ...withQuantity(saved, 2), inPayments: [payment], shipments: [shipment] }));

    await test.step("act: save the order", async () => (await api.put(ORDERS_PATH, { json: recalculated })).expectOk());

    await test.step("assert: the order keeps the quantity, the payment and the shipment", async () => {
      const reloaded = await orderOf(api, order.id);
      expect(reloaded?.items?.map(({ quantity }) => quantity)).toEqual([2]);
      expect(reloaded?.inPayments?.map(({ number }) => number)).toEqual([payment.number]);
      expect(reloaded?.shipments?.map(({ number }) => number)).toEqual([shipment.number]);
    });
    await test.step("assert: the change log records the save", async () => {
      await expect
        .poll(async () => (await changesOf(api, order.id)).length, { timeout: CHANGE_LOG_TIMEOUT_MS })
        .toBeGreaterThan(changesBefore.length);
    });
  });

  test("delete an order", async ({ api, arrange }) => {
    const order = await test.step("arrange: an order", () => arrange.orders.order());

    await test.step("act: delete the order", async () =>
      (await api.delete(ORDERS_PATH, { query: { ids: [order.id] } })).expectOk());

    await test.step("assert: the order is not found", async () => {
      expect(await orderOf(api, order.id)).toBeUndefined();
      expect((await searchOrders(api, { keyword: order.number })).map(({ id }) => id)).not.toContain(order.id);
    });
  });
});

async function customerOf(graphql: GraphqlClient): Promise<{ readonly id: string; readonly userName: string }> {
  const { me } = await graphql.execute(GetMeDocument);
  return requireFields(me, ["id", "userName"], "The store administrator");
}

async function orderOf(api: HttpClient, id: string): Promise<CustomerOrder | undefined> {
  return (await api.get(`${ORDERS_PATH}/${id}`)).optionalJson<CustomerOrder>({ allow404: true });
}

async function searchOrders(api: HttpClient, criteria: Record<string, unknown>): Promise<CustomerOrder[]> {
  return (
    (await api.post(`${ORDERS_PATH}/search`, { json: criteria })).expectOk().json<CustomerOrderSearchResult>()
      .results ?? []
  );
}

async function recalculate(api: HttpClient, order: CustomerOrder): Promise<CustomerOrder> {
  return (await api.put(`${ORDERS_PATH}/recalculate`, { json: order })).expectOk().json<CustomerOrder>();
}

async function changesOf(api: HttpClient, orderId: string): Promise<OperationLog[]> {
  const response = await api.post(`${ORDERS_PATH}/searchChanges`, { json: { orderId } });
  return response.expectOk().json<{ results?: OperationLog[] | null }>().results ?? [];
}
