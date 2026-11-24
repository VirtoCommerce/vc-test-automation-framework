import { ORGANIZATION_MAINTAINER, STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { OrderDocument, OrganizationOrdersDocument } from "@graphql/generated/graphql.ts";
import { requireDefined, requireFields } from "@support/require-fields.ts";

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

test.describe("orders (organization maintainer)", () => {
  test.use({ shopperAs: ORGANIZATION_MAINTAINER });

  test("get an order by number", async ({ shopper }) => {
    const { cultureName } = shopper.storeContext;

    const { order } = await test.step(`act: get order ${ORDER_NUMBER}`, () =>
      shopper.graphql.execute(OrderDocument, { number: ORDER_NUMBER, cultureName }));

    await test.step("assert: the order is returned", () => {
      expect(order?.number).toBe(ORDER_NUMBER);
    });
  });

  for (const status of STATUSES) {
    test(`filter organization orders by status ${status}`, async ({ shopper, dataset }) => {
      const datasetOrders = dataset.orders.filter(({ organizationId }) => organizationId === ORGANIZATION_ID);
      const datasetNumbers = new Set(datasetOrders.map(({ number }) => number));
      const expectedNumbers = datasetOrders
        .filter((order) => order.status === status)
        .map(({ number }) => number)
        .toSorted();

      const { organizationOrders } = await test.step(`act: filter by status ${status}`, () =>
        shopper.graphql.execute(OrganizationOrdersDocument, {
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

  test("filter organization orders by created date", async ({ shopper, dataset }) => {
    const datasetNumbers = new Set(dataset.orders.all().map(({ number }) => number));
    const datasetOrders = await test.step("arrange: the organization's dataset orders, oldest first", async () => {
      const { organizationOrders } = await shopper.graphql.execute(OrganizationOrdersDocument, {
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
      shopper.graphql.execute(OrganizationOrdersDocument, {
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
  test.use({ shopperAs: STORE_ADMINISTRATOR });

  test("search organization orders by number", async ({ shopper }) => {
    const { organizationOrders } = await test.step(`act: filter by number ${ORDER_NUMBER}`, () =>
      shopper.graphql.execute(OrganizationOrdersDocument, {
        filter: `number:${ORDER_NUMBER}`,
        first: ORDERS_PAGE_SIZE,
      }));

    await test.step("assert: exactly that order is found", () => {
      expect(requireDefined(organizationOrders?.items, "Order").map(({ number }) => number)).toEqual([ORDER_NUMBER]);
    });
  });

  for (const { field, direction, value, compare } of SORTS) {
    test(`sort organization orders by ${field} ${direction}`, async ({ shopper }) => {
      const { organizationOrders } = await test.step(`act: sort by ${field}:${direction}`, () =>
        shopper.graphql.execute(OrganizationOrdersDocument, {
          sort: `${field}:${direction}`,
          first: ORDERS_PAGE_SIZE,
        }));

      await test.step(`assert: the orders are in ${direction} ${field} order`, () => {
        const values = requireDefined(organizationOrders?.items, "Order").map(value);
        expect(values.length).toBeGreaterThan(1);
        expect(values).toEqual(values.toSorted(compare));
      });
    });
  }
});
