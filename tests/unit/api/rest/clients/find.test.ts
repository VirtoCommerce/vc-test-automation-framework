import type { Server } from "node:http";
import type { APIRequestContext } from "@playwright/test";

import { createServer } from "node:http";

import { expect, test } from "@playwright/test";

import { HttpClient } from "@api/http/http-client";
import { HttpError } from "@api/http/http-error";
import { RestApi } from "@api/rest/rest-api";
import { CATALOG_PRODUCT } from "@api/rest/types/catalog";
import { COMPLETENESS_CHANNEL, EVALUATE_COMPLETENESS_NOTIFICATION } from "@api/rest/types/completeness";
import { MENU_LINK_LIST } from "@api/rest/types/content";
import { MEMBER } from "@api/rest/types/customers";
import { COUPON, NAMED_ENTITY, PROMOTION } from "@api/rest/types/marketing";
import { ORGANIZATION_MEMBERSHIP } from "@api/rest/types/memberships";
import { CUSTOMER_ORDER } from "@api/rest/types/orders";
import { OUTLINE_SYNC_NOTIFICATION } from "@api/rest/types/personalization";
import { PRICELIST, PRICELIST_ASSIGNMENT } from "@api/rest/types/pricing";
import { INDEX_PROGRESS_NOTIFICATION } from "@api/rest/types/search";
import { APPLICATION_USER, ROLE } from "@api/rest/types/security";
import { STORE } from "@api/rest/types/store";

const ID = "find-test-id";

interface Answer {
  readonly status: number;
  readonly body: string;
}

/**
 * How an endpoint answers a lookup:
 * - `"empty"`: 200 with an empty body for a missing record; a 404 means a wrong path.
 * - `"404"`: 404 for a missing record.
 * - `"list"`: one record in a JSON array.
 * - `"push"`: a push notification search.
 */
type Shape = "empty" | "404" | "list" | "push";

interface Finder {
  readonly name: string;
  readonly shape: Shape;
  readonly fields: readonly string[];
  readonly find: (restApi: RestApi) => Promise<unknown>;
}

const FINDERS: readonly Finder[] = [
  {
    name: "catalog.products.find",
    shape: "list",
    fields: CATALOG_PRODUCT.fields,
    find: (api) => api.catalog.products.find(ID),
  },
  {
    name: "completeness.channels.find",
    shape: "404",
    fields: COMPLETENESS_CHANNEL.fields,
    find: (api) => api.completeness.channels.find(ID),
  },
  {
    name: "completeness.findEvaluation",
    shape: "push",
    fields: EVALUATE_COMPLETENESS_NOTIFICATION.fields,
    find: (api) => api.completeness.findEvaluation(ID),
  },
  {
    name: "customers.contacts.find",
    shape: "empty",
    fields: MEMBER.fields,
    find: (api) => api.customers.contacts.find(ID),
  },
  {
    name: "dynamicContent.items.find",
    shape: "404",
    fields: NAMED_ENTITY.fields,
    find: (api) => api.dynamicContent.items.find(ID),
  },
  {
    name: "menuLinkLists.find",
    shape: "empty",
    fields: MENU_LINK_LIST.fields,
    find: (api) => api.menuLinkLists.find(ID),
  },
  { name: "orders.find", shape: "404", fields: CUSTOMER_ORDER.fields, find: (api) => api.orders.find(ID) },
  {
    name: "organizationMemberships.find",
    shape: "404",
    fields: ORGANIZATION_MEMBERSHIP.fields,
    find: (api) => api.organizationMemberships.find(ID, "organization"),
  },
  {
    name: "personalization.findSynchronization",
    shape: "push",
    fields: OUTLINE_SYNC_NOTIFICATION.fields,
    find: (api) => api.personalization.findSynchronization(ID),
  },
  {
    name: "pricing.pricelists.find",
    shape: "empty",
    fields: PRICELIST.fields,
    find: (api) => api.pricing.pricelists.find(ID),
  },
  {
    name: "pricing.assignments.find",
    shape: "empty",
    fields: PRICELIST_ASSIGNMENT.fields,
    find: (api) => api.pricing.assignments.find(ID),
  },
  { name: "promotions.find", shape: "404", fields: PROMOTION.fields, find: (api) => api.promotions.find(ID) },
  {
    name: "promotions.coupons.find",
    shape: "empty",
    fields: COUPON.fields,
    find: (api) => api.promotions.coupons.find(ID),
  },
  { name: "roles.find", shape: "empty", fields: ROLE.fields, find: (api) => api.roles.find(ID) },
  {
    name: "searchIndexes.findProgress",
    shape: "push",
    fields: INDEX_PROGRESS_NOTIFICATION.fields,
    find: (api) => api.searchIndexes.findProgress(ID),
  },
  { name: "stores.find", shape: "empty", fields: STORE.fields, find: (api) => api.stores.find(ID) },
  { name: "users.find", shape: "empty", fields: APPLICATION_USER.fields, find: (api) => api.users.find(ID) },
];

let server: Server;
let context: APIRequestContext;
let answer: Answer = { status: 200, body: "" };

test.beforeAll(async ({ playwright }) => {
  server = createServer((_request, response) => {
    response.writeHead(answer.status, { "Content-Type": "application/json" }).end(answer.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the stub server has no port");
  }
  context = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${address.port}` });
});

test.afterAll(async () => {
  await context.dispose();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

function find(finder: Finder, next: Answer): Promise<unknown> {
  answer = next;
  const httpClient = new HttpClient(context);
  return finder.find(new RestApi(httpClient, "store-acme"));
}

function record(fields: readonly string[]): Record<string, string> {
  return Object.fromEntries([["id", ID], ...fields.map((field) => [field, field === "id" ? ID : `${field}-value`])]);
}

function found(shape: Shape, value: unknown): Answer {
  if (shape === "list") {
    return { status: 200, body: JSON.stringify([value]) };
  }
  if (shape === "push") {
    return { status: 200, body: JSON.stringify({ notifyEvents: [value] }) };
  }
  return { status: 200, body: JSON.stringify(value) };
}

function missing(shape: Shape): Answer {
  switch (shape) {
    case "404":
      return { status: 404, body: "" };
    case "list":
      return { status: 200, body: "[]" };
    case "push":
      return { status: 200, body: JSON.stringify({ notifyEvents: [] }) };
    default:
      return { status: 200, body: "" };
  }
}

test.describe("find methods", () => {
  for (const finder of FINDERS) {
    test.describe(finder.name, () => {
      test("returns a found record with its required fields", async () => {
        const complete = record(finder.fields);

        expect(await find(finder, found(finder.shape, complete))).toEqual(complete);
      });

      test("returns undefined for a missing record", async () => {
        expect(await find(finder, missing(finder.shape))).toBeUndefined();
      });

      const lacking = finder.fields.filter((field) => field !== "id");
      if (lacking.length > 0) {
        test("throws for a found record without its required fields", async () => {
          await expect(find(finder, found(finder.shape, { id: ID }))).rejects.toThrow(`has no ${lacking.join(", ")}`);
        });
      }

      if (finder.shape === "empty") {
        test("throws for a 404, which means a wrong path here", async () => {
          await expect(find(finder, { status: 404, body: "" })).rejects.toBeInstanceOf(HttpError);
        });
      }

      if (finder.shape === "404") {
        test("returns undefined for an empty body too", async () => {
          expect(await find(finder, { status: 200, body: "" })).toBeUndefined();
        });
      }
    });
  }
});
