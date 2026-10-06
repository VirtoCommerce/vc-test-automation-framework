import type { CustomerOrder } from "@api/rest/types/orders";
import type { CustomerOrderDraft } from "@dataset/builders/order";
import type { Dataset } from "@dataset/dataset";

import * as allure from "allure-js-commons";

import { CUSTOMER_ORDERS_PATH, OrdersClient } from "@api/rest/clients/orders-client";
import { SearchIndexesClient } from "@api/rest/clients/search-indexes-client";
import { requireFields } from "@core/required-fields";
import { arrangeOrder } from "@dataset/arrange/order";
import { MAX_ORDER_NUMBER_LENGTH, newLineItem, newOrder } from "@dataset/builders/order";
import { getProduct, getUser } from "@dataset/dataset";
import { SEEDED_PRODUCTS, SEEDED_USERS } from "@dataset/seeded";
import { expect, seededUser, test } from "@fixtures";

const USERNAME = SEEDED_USERS.storeAdministrator;
const SEEDED_PRODUCT_ID = SEEDED_PRODUCTS.configurableLaptop;
const LINE_ITEM_PRICE = 100;
const CHANGE_LOG_TIMEOUT_MS = 30_000;
const ORDER_DOCUMENT_TYPE = "CustomerOrder";
const NEWEST_ORDERS_TAKE = 20;
const PAYMENT_NUMBER = /^PI\d{6}-\d{5}$/;
const SHIPMENT_NUMBER = /^SH\d{6}-\d{5}$/;

test.beforeEach(async () => {
  await allure.feature("Orders");
});

test.describe("customer orders (admin)", () => {
  test.use({ user: seededUser(USERNAME) });

  test("create an order", async ({ httpClient, cleanupStack, dataset, env }) => {
    const ordersClient = new OrdersClient(httpClient);
    const draft = newOrder(env.storeId, getUser(dataset, USERNAME));
    cleanupStack.push(`delete order ${draft.number}`, () => ordersClient.delete(draft.id));

    const order = await test.step("act: create order", () => ordersClient.create(draft));

    await test.step("assert: order is new in the seeded store", async () => {
      expect(order).toMatchObject({ id: draft.id, number: draft.number, status: "New", storeId: env.storeId });
    });
  });

  test("get an order by id", async ({ httpClient, cleanupStack, dataset, env }) => {
    const ordersClient = new OrdersClient(httpClient);
    const order = await test.step("arrange: order", () =>
      arrangeOrder(ordersClient, cleanupStack, newOrder(env.storeId, getUser(dataset, USERNAME))));

    const reloaded = await test.step("act: get order", () => ordersClient.get(order.id));

    await test.step("assert: fields match the created order", async () => {
      expect(reloaded).toMatchObject({ id: order.id, number: order.number, storeId: order.storeId });
    });
  });

  test("get an order by number", async ({ httpClient, cleanupStack, dataset, env }) => {
    const ordersClient = new OrdersClient(httpClient);
    const order = await test.step("arrange: order", () =>
      arrangeOrder(ordersClient, cleanupStack, newOrder(env.storeId, getUser(dataset, USERNAME))));

    const reloaded = await test.step("act: get order by number", () => ordersClient.getByNumber(order.number));

    await test.step("assert: the same order is returned", async () => {
      expect(reloaded).toMatchObject({ id: order.id, number: order.number });
    });
  });

  test("get a missing order", async ({ httpClient }) => {
    const ordersClient = new OrdersClient(httpClient);

    const order = await test.step("act: get order by a missing id", () => ordersClient.find(crypto.randomUUID()));

    await test.step("assert: order is not found", async () => {
      expect(order).toBeUndefined();
    });
  });

  test("list orders", async ({ httpClient, cleanupStack, dataset, env }) => {
    const ordersClient = new OrdersClient(httpClient);
    const order = await test.step("arrange: order", () =>
      arrangeOrder(ordersClient, cleanupStack, newOrder(env.storeId, getUser(dataset, USERNAME))));

    const orders = await test.step("act: list the newest orders", () =>
      ordersClient.search({ sort: "createdDate:desc", take: NEWEST_ORDERS_TAKE }));

    await test.step("assert: the new order is listed and the list is newest first", async () => {
      expect(orders.map(({ id }) => id)).toContain(order.id);
      const createdTimes = orders.map((listed) =>
        Date.parse(requireFields(listed, ["createdDate"], `Order ${listed.number}`).createdDate),
      );
      expect(createdTimes).toEqual([...createdTimes].sort((left, right) => right - left));
    });
  });

  test("search orders by number", async ({ httpClient, cleanupStack, dataset, env }) => {
    const ordersClient = new OrdersClient(httpClient);
    const order = await test.step("arrange: order", () =>
      arrangeOrder(ordersClient, cleanupStack, newOrder(env.storeId, getUser(dataset, USERNAME))));

    const found = await test.step("act: search by order number", () =>
      ordersClient.search({ keyword: order.number, take: 5 }));

    await test.step("assert: order is in the results", async () => {
      expect(found.map(({ id }) => id)).toContain(order.id);
    });
  });

  test("the indexed order search flag matches the registered order index", async ({ httpClient }) => {
    const ordersClient = new OrdersClient(httpClient);
    const searchIndexesClient = new SearchIndexesClient(httpClient);

    const enabled = await test.step("act: check indexed search", () => ordersClient.isIndexedSearchEnabled());

    await test.step(`assert: the ${ORDER_DOCUMENT_TYPE} index is registered exactly when the flag is ${enabled}`, async () => {
      const documentTypes = (await searchIndexesClient.list()).map(({ documentType }) => documentType);
      expect(documentTypes.includes(ORDER_DOCUMENT_TYPE)).toBe(enabled);
    });
  });

  test("generate a new payment for an order", async ({ httpClient, cleanupStack, dataset, env }) => {
    const ordersClient = new OrdersClient(httpClient);
    const order = await test.step("arrange: order with a line item", () =>
      arrangeOrder(ordersClient, cleanupStack, orderWithLineItem(dataset, env.storeId)));

    const payment = await test.step("act: generate payment", () => ordersClient.newPayment(order.id));

    await test.step("assert: a new incoming payment of the order customer, numbered and in the order currency", async () => {
      expect(payment).toMatchObject({
        operationType: "PaymentIn",
        status: "New",
        customerId: order.customerId,
        currency: order.currency,
      });
      expect(payment.number).toMatch(PAYMENT_NUMBER);
    });
  });

  test("generate a new shipment for an order", async ({ httpClient, cleanupStack, dataset, env }) => {
    const ordersClient = new OrdersClient(httpClient);
    const order = await test.step("arrange: order with a line item", () =>
      arrangeOrder(ordersClient, cleanupStack, orderWithLineItem(dataset, env.storeId)));

    const shipment = await test.step("act: generate shipment", () => ordersClient.newShipment(order.id));

    await test.step("assert: a new shipment, numbered and in the order currency", async () => {
      expect(shipment).toMatchObject({ operationType: "Shipment", status: "New", currency: order.currency });
      expect(shipment.number).toMatch(SHIPMENT_NUMBER);
    });
  });

  test("change the status of an order", async ({ httpClient, cleanupStack, dataset, env }) => {
    const ordersClient = new OrdersClient(httpClient);
    const order = await test.step("arrange: order", () =>
      arrangeOrder(ordersClient, cleanupStack, newOrder(env.storeId, getUser(dataset, USERNAME))));

    await test.step("act: set status to Processing", () => ordersClient.update({ ...order, status: "Processing" }));

    await test.step("assert: order is processing", async () => {
      expect((await ordersClient.get(order.id)).status).toBe("Processing");
    });
  });

  test("recalculate order totals after a quantity change", async ({ httpClient, cleanupStack, dataset, env }) => {
    const ordersClient = new OrdersClient(httpClient);
    const order = await test.step("arrange: order with a line item", () =>
      arrangeOrder(ordersClient, cleanupStack, orderWithLineItem(dataset, env.storeId)));

    const recalculated = await test.step("act: recalculate with quantity 2", () =>
      ordersClient.recalculate(withFirstItemQuantity(order, 2)));

    await test.step("assert: total is price times quantity", async () => {
      expect(recalculated.items[0]).toMatchObject({ quantity: 2, price: LINE_ITEM_PRICE });
      expect(recalculated.total).toBe(LINE_ITEM_PRICE * 2);
    });
  });

  test("attach a payment and a shipment to an order", async ({ httpClient, cleanupStack, dataset, env }) => {
    const ordersClient = new OrdersClient(httpClient);
    const order = await test.step("arrange: order with a line item", () =>
      arrangeOrder(ordersClient, cleanupStack, orderWithLineItem(dataset, env.storeId)));
    const payment = await test.step("arrange: new payment", () => ordersClient.newPayment(order.id));
    const shipment = await test.step("arrange: new shipment", () => ordersClient.newShipment(order.id));
    const recalculated = await test.step("arrange: recalculated order", () =>
      ordersClient.recalculate({ ...withFirstItemQuantity(order, 2), inPayments: [payment], shipments: [shipment] }));

    await test.step("act: save order", () => ordersClient.update(recalculated));

    await test.step("assert: order keeps the payment, shipment and quantity", async () => {
      const saved = await ordersClient.getByNumber(order.number);
      expect(saved.items[0]?.quantity).toBe(2);
      expect(saved.inPayments?.map(({ number }) => number)).toEqual([payment.number]);
      expect(saved.shipments?.map(({ number }) => number)).toEqual([shipment.number]);
    });
  });

  test("record order changes after an update", async ({ httpClient, cleanupStack, dataset, env }) => {
    const ordersClient = new OrdersClient(httpClient);
    const order = await test.step("arrange: order with a line item", () =>
      arrangeOrder(ordersClient, cleanupStack, orderWithLineItem(dataset, env.storeId)));
    const initial = await test.step("arrange: initial change count", async () =>
      requireFields(
        await ordersClient.searchChanges({ orderId: order.id, take: 10 }),
        ["totalCount"],
        "Initial change log",
      ));
    const payment = await test.step("arrange: new payment", () => ordersClient.newPayment(order.id));
    const shipment = await test.step("arrange: new shipment", () => ordersClient.newShipment(order.id));

    await test.step("act: save order with a payment, a shipment and a new quantity", async () =>
      ordersClient.update(
        await ordersClient.recalculate({
          ...withFirstItemQuantity(order, 2),
          inPayments: [payment],
          shipments: [shipment],
        }),
      ));

    await test.step("assert: change count grows", async () => {
      await expect
        .poll(async () => (await ordersClient.searchChanges({ orderId: order.id, take: 10 })).totalCount, {
          timeout: CHANGE_LOG_TIMEOUT_MS,
        })
        .toBeGreaterThan(initial.totalCount);
    });
  });

  test("delete an order", async ({ httpClient, cleanupStack, dataset, env }) => {
    const ordersClient = new OrdersClient(httpClient);
    const order = await test.step("arrange: order", () =>
      arrangeOrder(ordersClient, cleanupStack, newOrder(env.storeId, getUser(dataset, USERNAME))));

    await test.step("act: delete order", () => ordersClient.delete(order.id));

    await test.step("assert: order is not found", async () => {
      expect(await ordersClient.find(order.id)).toBeUndefined();
      expect((await ordersClient.search({ keyword: order.number })).map(({ id }) => id)).not.toContain(order.id);
    });
  });

  test("reject an order number that is too long", async ({ httpClient, cleanupStack, dataset, env }) => {
    const ordersClient = new OrdersClient(httpClient);
    const draft = {
      ...newOrder(env.storeId, getUser(dataset, USERNAME)),
      number: "X".repeat(MAX_ORDER_NUMBER_LENGTH + 1),
    };
    cleanupStack.push(`delete order ${draft.id}`, () => ordersClient.delete(draft.id));

    const response = await test.step(`act: create order with a ${MAX_ORDER_NUMBER_LENGTH + 1}-character number`, () =>
      httpClient.post(CUSTOMER_ORDERS_PATH, { json: draft }));

    await test.step("assert: order number length is rejected", async () => {
      expect(response.status).toBe(400);
      expect(response.text).toContain(`must be ${MAX_ORDER_NUMBER_LENGTH} characters or fewer`);
    });
  });
});

function orderWithLineItem(dataset: Dataset, storeId: string): CustomerOrderDraft {
  const product = getProduct(dataset, SEEDED_PRODUCT_ID);
  return newOrder(storeId, getUser(dataset, USERNAME), [newLineItem(product, LINE_ITEM_PRICE)]);
}

function withFirstItemQuantity(order: CustomerOrder, quantity: number): CustomerOrder {
  return { ...order, items: order.items.map((item, index) => (index === 0 ? { ...item, quantity } : item)) };
}
