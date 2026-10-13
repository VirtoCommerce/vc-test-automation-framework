import * as allure from "allure-js-commons";

import { OrderDocument, OrganizationOrdersDocument } from "@api/graphql/generated/graphql";
import { requireDefined, requireFields } from "@core/required-fields";
import { expect, test } from "@fixtures";

const ORGANIZATION_ID = "organization-acme-store";
const ORDER_NUMBER = "CO251029-00038";
const STATUSES = ["New", "Completed", "Pending", "Payment required", "ReadyForPickup"] as const;
interface SortedOrder {
  readonly createdDate: string;
  readonly total: { readonly amount: number };
}

const ASCENDING = (a: number, b: number) => a - b;
const DESCENDING = (a: number, b: number) => b - a;
const SORTS = [
  {
    field: "createdDate",
    direction: "asc",
    value: (order: SortedOrder) => Date.parse(order.createdDate),
    compare: ASCENDING,
  },
  {
    field: "createdDate",
    direction: "desc",
    value: (order: SortedOrder) => Date.parse(order.createdDate),
    compare: DESCENDING,
  },
  { field: "total", direction: "asc", value: (order: SortedOrder) => order.total.amount, compare: ASCENDING },
  { field: "total", direction: "desc", value: (order: SortedOrder) => order.total.amount, compare: DESCENDING },
] as const;
const ORDERS_PAGE_SIZE = 100;

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Orders");
});

test.describe("orders (organization maintainer)", () => {
  test.use({ user: "acme_store_maintainer_1@acme.com" });

  test("get an order by number", async ({ api }) => {
    await allure.story("Order");
    await allure.description("A maintainer opens an order of the organization by its number.");
    const { cultureName } = await api.storeContext();

    const { order } = await test.step(`act: get order ${ORDER_NUMBER}`, () =>
      api.graphql.execute(OrderDocument, { number: ORDER_NUMBER, cultureName }));

    await test.step("assert: the order is returned", () => {
      expect(order?.number).toBe(ORDER_NUMBER);
    });
  });

  for (const status of STATUSES) {
    test(`filter organization orders by status ${status}`, async ({ api, dataset }) => {
      await allure.story("Filters");
      await allure.description(
        `Filtering the organization's orders by ${status} returns only ${status} orders: ` +
          `every dataset order of the organization with that status and no dataset order with another.`,
      );
      const datasetOrders = dataset.orders.filter(({ organizationId }) => organizationId === ORGANIZATION_ID);
      const datasetNumbers = new Set(datasetOrders.map(({ number }) => number));
      const expectedNumbers = datasetOrders
        .filter((order) => order.status === status)
        .map(({ number }) => number)
        .toSorted();

      const { organizationOrders } = await test.step(`act: filter by status ${status}`, () =>
        api.graphql.execute(OrganizationOrdersDocument, {
          organizationId: ORGANIZATION_ID,
          filter: `status:"${status}"`,
          first: ORDERS_PAGE_SIZE,
        }));

      await test.step(`assert: only ${status} orders, exactly the dataset's ${status} orders among them`, () => {
        const found = requireDefined(organizationOrders?.items, "Order");
        expect(expectedNumbers).not.toEqual([]);
        expect(found.filter((order) => order.status !== status).map(({ number }) => number)).toEqual([]);
        expect(
          found
            .map(({ number }) => number)
            .filter((number) => datasetNumbers.has(number))
            .toSorted(),
        ).toEqual(expectedNumbers);
      });
    });
  }

  test("filter organization orders by created date", async ({ api, dataset }) => {
    await allure.story("Filters");
    await allure.description("A created-date range between dataset orders returns exactly the orders inside it.");
    const datasetNumbers = new Set(dataset.orders.all().map(({ number }) => number));
    const datasetOrders = await test.step("arrange: the organization's dataset orders, oldest first", async () => {
      const { organizationOrders } = await api.graphql.execute(OrganizationOrdersDocument, {
        organizationId: ORGANIZATION_ID,
        sort: "createdDate:asc",
        first: ORDERS_PAGE_SIZE,
      });
      return requireDefined(organizationOrders?.items, "Order").filter(({ number }) => datasetNumbers.has(number));
    });
    const { first, second, third, fourth } = requireFields(
      { first: datasetOrders[0], second: datasetOrders[1], third: datasetOrders[2], fourth: datasetOrders[3] },
      ["first", "second", "third", "fourth"],
      "The four oldest dataset orders",
    );
    const from = new Date((Date.parse(first.createdDate) + Date.parse(second.createdDate)) / 2).toISOString();
    const to = new Date((Date.parse(third.createdDate) + Date.parse(fourth.createdDate)) / 2).toISOString();

    const { organizationOrders } = await test.step(`act: filter by created date ${from} to ${to}`, () =>
      api.graphql.execute(OrganizationOrdersDocument, {
        organizationId: ORGANIZATION_ID,
        filter: `createddate:["${from}" TO "${to}"]`,
        first: ORDERS_PAGE_SIZE,
      }));

    await test.step(`assert: exactly ${second.number} and ${third.number} were created in the range`, () => {
      expect(
        requireDefined(organizationOrders?.items, "Order")
          .map(({ number }) => number)
          .toSorted(),
      ).toEqual([second.number, third.number].toSorted());
    });
  });
});

test.describe("orders (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("search organization orders by number", async ({ api }) => {
    await allure.story("Search");
    await allure.description("Filtering orders by number finds exactly that order.");

    const { organizationOrders } = await test.step(`act: filter by number ${ORDER_NUMBER}`, () =>
      api.graphql.execute(OrganizationOrdersDocument, { filter: `number:${ORDER_NUMBER}`, first: ORDERS_PAGE_SIZE }));

    await test.step("assert: exactly that order is found", () => {
      expect(requireDefined(organizationOrders?.items, "Order").map(({ number }) => number)).toEqual([ORDER_NUMBER]);
    });
  });

  for (const { field, direction, value, compare } of SORTS) {
    test(`sort organization orders by ${field} ${direction}`, async ({ api }) => {
      await allure.story("Sorting");
      await allure.description(`Orders sorted by ${field} ${direction} come back in that order.`);

      const { organizationOrders } = await test.step(`act: sort by ${field}:${direction}`, () =>
        api.graphql.execute(OrganizationOrdersDocument, { sort: `${field}:${direction}`, first: ORDERS_PAGE_SIZE }));

      await test.step(`assert: the orders are in ${direction} ${field} order`, () => {
        const values = requireDefined(organizationOrders?.items, "Order").map(value);
        expect(values.length).toBeGreaterThan(1);
        expect(values).toEqual(values.toSorted(compare));
      });
    });
  }
});
