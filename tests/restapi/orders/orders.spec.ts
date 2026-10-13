import type { RestApi } from "@api/rest/rest-api";
import type { CustomerOrder } from "@api/rest/types/orders";

import { randomUUID } from "node:crypto";

import * as allure from "allure-js-commons";

import { MAX_ORDER_NUMBER_LENGTH, newOrder, withQuantity } from "@dataset/builders/order";
import { expect, test } from "@fixtures";

const ADMINISTRATOR = "acme_store_administrator@acme.com";
const PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";
const PRICE = 100;
const ORDER_INDEX = "CustomerOrder";
const CHANGE_LOG_TIMEOUT_MS = 30_000;
const DOCUMENT_TEMPLATES = [
  {
    document: "payment",
    template: (rest: RestApi, order: CustomerOrder) => rest.orders.paymentTemplate(order.id),
    expected: (order: CustomerOrder) => ({ operationType: "PaymentIn", customerId: order.customerId }),
    number: /^PI\d{6}-\d{5}$/,
  },
  {
    document: "shipment",
    template: (rest: RestApi, order: CustomerOrder) => rest.orders.shipmentTemplate(order.id),
    expected: () => ({ operationType: "Shipment" }),
    number: /^SH\d{6}-\d{5}$/,
  },
] as const;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Orders");
});

test.describe("customer orders (store administrator)", () => {
  test.use({ user: ADMINISTRATOR });

  test("create an order", async ({ api, cleanup, store }) => {
    await allure.story("Create");
    await allure.description("A new order is in the store with status New.");
    const { userId } = await api.storeContext();
    const draft = newOrder({ id: store.id, currency: store.defaultCurrency }, { id: userId, userName: ADMINISTRATOR });
    cleanup.push(`delete order ${draft.number}`, () => api.rest.orders.delete([draft.id]));

    const order = await test.step("act: create an order", () => api.rest.orders.create(draft));

    await test.step("assert: the order is new, in the store", () => {
      expect(order).toMatchObject({ id: draft.id, number: draft.number, status: "New", storeId: store.id });
    });
  });

  test(`reject an order number longer than ${MAX_ORDER_NUMBER_LENGTH} characters`, async ({ api, cleanup, store }) => {
    await allure.story("Create");
    await allure.description(`An order number may have at most ${MAX_ORDER_NUMBER_LENGTH} characters.`);
    const { userId } = await api.storeContext();
    const draft = {
      ...newOrder({ id: store.id, currency: store.defaultCurrency }, { id: userId, userName: ADMINISTRATOR }),
      number: "X".repeat(MAX_ORDER_NUMBER_LENGTH + 1),
    };
    cleanup.push("delete the order, should it have been created", () => api.rest.orders.delete([draft.id]));

    await test.step("assert: creating the order is rejected", async () => {
      await expect(api.rest.orders.create(draft)).rejects.toBeHttpError(
        400,
        `must be ${MAX_ORDER_NUMBER_LENGTH} characters or fewer`,
      );
    });
  });

  test("get an order by id", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("An order is read back by its id.");
    const order = await test.step("arrange: an order", () => arrange.orders.order());

    const reloaded = await test.step("act: get the order", () => api.rest.orders.get(order.id));

    await test.step("assert: the fields match the created order", () => {
      expect(reloaded).toMatchObject({ id: order.id, number: order.number, storeId: order.storeId });
    });
  });

  test("get an order by number", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("An order is read back by its number.");
    const order = await test.step("arrange: an order", () => arrange.orders.order());

    const reloaded = await test.step(`act: get order ${order.number}`, () => api.rest.orders.getByNumber(order.number));

    await test.step("assert: the same order is returned", () => {
      expect(reloaded).toMatchObject({ id: order.id, number: order.number });
    });
  });

  test("get a missing order", async ({ api }) => {
    await allure.story("Read");
    await allure.description("Looking an order up by an id that does not exist finds nothing.");

    const order = await test.step("act: look an order up by an unknown id", () => api.rest.orders.find(randomUUID()));

    await test.step("assert: no order is found", () => {
      expect(order).toBeUndefined();
    });
  });

  test("search orders by number", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description("Searching orders by an order's number finds it.");
    const order = await test.step("arrange: an order", () => arrange.orders.order());

    const found = await test.step(`act: search orders by ${order.number}`, () =>
      api.rest.orders.search({ keyword: order.number }));

    await test.step("assert: the order is found", () => {
      expect(found.map(({ id }) => id)).toContain(order.id);
    });
  });

  test("sort orders by created date, newest first", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description("Two orders sorted by created date, newest first, come back in reverse creation order.");
    const older = await test.step("arrange: an order", () => arrange.orders.order());
    const newer = await test.step("arrange: a newer order", () => arrange.orders.order());

    const found = await test.step("act: search both orders, newest first", () =>
      api.rest.orders.search({ ids: [older.id, newer.id], sort: "createdDate:desc" }));

    await test.step("assert: the newer order comes first", () => {
      expect(found.map(({ id }) => id)).toEqual([newer.id, older.id]);
    });
  });

  test("indexed order search is enabled with the order index registered", async ({ api }) => {
    await allure.story("Search");
    await allure.description(
      `Orders are searched through the search index: the platform reports indexed search on, and the ${ORDER_INDEX} ` +
        "index is registered.",
    );

    const enabled = await test.step("act: ask whether indexed order search is enabled", () =>
      api.rest.orders.isIndexedSearchEnabled());

    await test.step(`assert: it is, and the ${ORDER_INDEX} index is registered`, async () => {
      expect(enabled).toBe(true);
      expect((await api.rest.searchIndexes.list()).map(({ documentType }) => documentType)).toContain(ORDER_INDEX);
    });
  });

  for (const { document, template, expected, number } of DOCUMENT_TEMPLATES) {
    test(`get a new ${document} for an order`, async ({ api, arrange }) => {
      await allure.story("Documents");
      await allure.description(`A new ${document} of an order is numbered, New and in the order's currency.`);
      const order = await test.step("arrange: an order with a line item", () =>
        arrange.orders.order([{ productId: PRODUCT_ID, price: PRICE }]));

      const created = await test.step(`act: get a new ${document}`, () => template(api.rest, order));

      await test.step(`assert: the ${document} is new, numbered and in the order's currency`, () => {
        expect(created).toMatchObject({ ...expected(order), status: "New", currency: order.currency });
        expect(created.number).toMatch(number);
      });
    });
  }

  test("change the status of an order", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("An order's new status is stored.");
    const order = await test.step("arrange: an order", () => arrange.orders.order());

    await test.step("act: set the status to Processing", () =>
      api.rest.orders.update({ ...order, status: "Processing" }));

    await test.step("assert: the order is processing", async () => {
      expect((await api.rest.orders.get(order.id)).status).toBe("Processing");
    });
  });

  test("recalculate the totals of an order after a quantity change", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("After its quantity changes, an order's total is the price times the quantity.");
    const order = await test.step(`arrange: an order of one item at ${PRICE}`, () =>
      arrange.orders.order([{ productId: PRODUCT_ID, price: PRICE }]));

    const recalculated = await test.step("act: recalculate the order with quantity 2", () =>
      api.rest.orders.recalculate(withQuantity(order, 2)));

    await test.step(`assert: the total is ${PRICE * 2}`, () => {
      expect(recalculated.items).toEqual([expect.objectContaining({ quantity: 2, price: PRICE })]);
      expect(recalculated.total).toBe(PRICE * 2);
    });
  });

  test("save an order with a payment, a shipment and a new quantity", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description(
      "A recalculated order saved with a new payment, a new shipment and a new quantity keeps all three, " +
        "and its change log records the save.",
    );
    const order = await test.step("arrange: an order with a line item", () =>
      arrange.orders.order([{ productId: PRODUCT_ID, price: PRICE }]));
    const changesBefore = await test.step("arrange: the order's change log", () =>
      api.rest.orders.searchChanges({ orderId: order.id }));
    const payment = await test.step("arrange: a new payment", () => api.rest.orders.paymentTemplate(order.id));
    const shipment = await test.step("arrange: a new shipment", () => api.rest.orders.shipmentTemplate(order.id));
    const recalculated = await test.step("arrange: the order recalculated with them and quantity 2", () =>
      api.rest.orders.recalculate({ ...withQuantity(order, 2), inPayments: [payment], shipments: [shipment] }));

    await test.step("act: save the order", () => api.rest.orders.update(recalculated));

    await test.step("assert: the order keeps the quantity, the payment and the shipment", async () => {
      const saved = await api.rest.orders.get(order.id);
      expect(saved.items.map(({ quantity }) => quantity)).toEqual([2]);
      expect(saved.inPayments?.map(({ number }) => number)).toEqual([payment.number]);
      expect(saved.shipments?.map(({ number }) => number)).toEqual([shipment.number]);
    });
    await test.step("assert: the change log records the save", async () => {
      await expect
        .poll(async () => (await api.rest.orders.searchChanges({ orderId: order.id })).length, {
          timeout: CHANGE_LOG_TIMEOUT_MS,
        })
        .toBeGreaterThan(changesBefore.length);
    });
  });

  test("delete an order", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A deleted order is neither read nor found by search.");
    const order = await test.step("arrange: an order", () => arrange.orders.order());

    await test.step("act: delete the order", () => api.rest.orders.delete([order.id]));

    await test.step("assert: the order is not found", async () => {
      expect(await api.rest.orders.find(order.id)).toBeUndefined();
      expect((await api.rest.orders.search({ keyword: order.number })).map(({ id }) => id)).not.toContain(order.id);
    });
  });
});
