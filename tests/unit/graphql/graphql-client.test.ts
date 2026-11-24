import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { APIRequestContext } from "@playwright/test";
import type { GraphqlDocument } from "@/graphql";

import { createServer } from "node:http";

import { expect, request, test } from "@playwright/test";

import { Secret } from "@/core";
import { GraphqlClient, GraphqlError } from "@/graphql";
import { HttpClient, HttpError } from "@/http";

type Received = { readonly path: string; readonly body: Record<string, unknown> };
type Planned = { readonly status: number; readonly body: unknown };
type Cart = { readonly cart: { readonly id: string } };
type CartVariables = { readonly storeId: string; readonly password?: string };

const GET_CART = documentOf<Cart, CartVariables>("query GetCart($storeId: String!) { cart(storeId: $storeId) { id } }");
const NO_VARIABLES = documentOf<Cart, Record<string, never>>("query CurrentCart { cart { id } }");
const ANONYMOUS = documentOf<Cart, Record<string, never>>("{ cart { id } }");
const CART_DATA = { cart: { id: "cart-1" } };

let server: Server;
let context: APIRequestContext;
let httpClient: HttpClient;
let graphql: GraphqlClient;
let received: Received[] = [];
let planned: Planned[] = [];

test.beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context = await request.newContext();
  httpClient = new HttpClient(context, `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  graphql = new GraphqlClient(httpClient);
});

test.afterAll(async () => {
  await context.dispose();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  received = [];
  planned = [];
});

test.describe("GraphqlClient request", () => {
  test("posts the query, the operation name and the variables to /graphql", async () => {
    await graphql.execute(GET_CART, { storeId: "store-1" });

    expect(received).toEqual([
      {
        path: "/graphql",
        body: { query: GET_CART.toString(), operationName: "GetCart", variables: { storeId: "store-1" } },
      },
    ]);
  });

  test("sends empty variables for an operation without variables", async () => {
    await graphql.execute(NO_VARIABLES);

    expect(received[0]?.body["variables"]).toEqual({});
  });

  test("sends no operation name for an anonymous operation", async () => {
    await graphql.execute(ANONYMOUS);

    expect(received[0]?.body).not.toHaveProperty("operationName");
  });

  test("reveals a Secret in the variables", async () => {
    await graphql.execute(GET_CART, { storeId: "store-1", password: Secret.of("Graphql-Variable-Secret-1") });

    expect(received[0]?.body["variables"]).toEqual({ storeId: "store-1", password: "Graphql-Variable-Secret-1" });
  });

  test("posts to a custom path", async () => {
    await new GraphqlClient(httpClient, "/xapi/graphql").execute(NO_VARIABLES);

    expect(received[0]?.path).toBe("/xapi/graphql");
  });

  const NAMES = [
    { title: "a mutation", text: "mutation AddItem($id: ID!) { addItem(id: $id) { id } }", name: "AddItem" },
    {
      title: "an operation followed by fragments",
      text: "query GetCart { cart { ...CartFields } } fragment CartFields on Cart { id }",
      name: "GetCart",
    },
    { title: "a field named query", text: "{ search(query: $query) { id } }", name: undefined },
  ];

  for (const { title, text, name } of NAMES) {
    test(`reads the operation name of ${title}`, async () => {
      await graphql.execute(documentOf<Cart, Record<string, never>>(text));

      expect(received[0]?.body["operationName"]).toBe(name);
    });
  }
});

test.describe("GraphqlClient.execute", () => {
  test("returns the data", async () => {
    expect(await graphql.execute(GET_CART, { storeId: "store-1" })).toEqual(CART_DATA);
  });

  test("throws a GraphqlError for errors with a success status", async () => {
    planned = [{ status: 200, body: { data: null, errors: [{ message: "Cart not found", path: ["cart"] }] } }];

    const error = await graphql.execute(GET_CART, { storeId: "store-1" }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GraphqlError);
    expect(error).toMatchObject({ operationName: "GetCart", status: 200, errors: [{ message: "Cart not found" }] });
  });

  test("throws a GraphqlError for errors with a 400 status", async () => {
    planned = [{ status: 400, body: { errors: [{ message: "Unknown argument", extensions: { code: "INVALID" } }] } }];

    await expect(graphql.execute(GET_CART, { storeId: "store-1" })).rejects.toThrow(
      expect.objectContaining({ name: "GraphqlError", status: 400 }),
    );
  });

  test("throws a GraphqlError for partial data with errors", async () => {
    planned = [{ status: 200, body: { data: CART_DATA, errors: [{ message: "Price unavailable" }] } }];

    await expect(graphql.execute(GET_CART, { storeId: "store-1" })).rejects.toThrow(GraphqlError);
  });

  test("throws a GraphqlError for a response without data and without errors", async () => {
    planned = [{ status: 200, body: { data: null } }];

    await expect(graphql.execute(ANONYMOUS)).rejects.toThrow(
      "GraphQL operation (anonymous) returned no data with status 200",
    );
  });
});

test.describe("GraphqlClient.executeRaw", () => {
  test("returns partial data with errors without throwing", async () => {
    planned = [{ status: 200, body: { data: CART_DATA, errors: [{ message: "Price unavailable" }] } }];

    expect(await graphql.executeRaw(GET_CART, { storeId: "store-1" })).toEqual({
      operationName: "GetCart",
      status: 200,
      data: CART_DATA,
      errors: [{ message: "Price unavailable" }],
    });
  });

  test("returns errors with a 400 status without throwing", async () => {
    planned = [{ status: 400, body: { errors: [{ message: "Unknown argument" }] } }];

    expect(await graphql.executeRaw(GET_CART, { storeId: "store-1" })).toMatchObject({
      status: 400,
      data: null,
      errors: [{ message: "Unknown argument" }],
    });
  });

  test("returns no errors and null data for a response that has neither", async () => {
    planned = [{ status: 200, body: {} }];

    expect(await graphql.executeRaw(NO_VARIABLES)).toMatchObject({ data: null, errors: [] });
  });
});

test.describe("GraphqlClient HTTP errors", () => {
  const FAILURES = [
    { title: "a failed status without errors", planned: { status: 500, body: { message: "Server error" } } },
    { title: "a failed status with an empty errors array", planned: { status: 400, body: { errors: [] } } },
    {
      title: "a failed status with a body that is not JSON",
      planned: { status: 502, body: "<html>Bad gateway</html>" },
    },
    {
      title: "a success status with a body that is not JSON",
      planned: { status: 200, body: "<html>Maintenance</html>" },
    },
    { title: "a body that is not a GraphQL response", planned: { status: 200, body: { errors: "not a list" } } },
  ];

  for (const failure of FAILURES) {
    test(`throws an HttpError for ${failure.title}`, async () => {
      planned = [failure.planned];

      await expect(graphql.execute(GET_CART, { storeId: "store-1" })).rejects.toThrow(HttpError);
    });
  }

  test("lists every mismatch for a body that is not a GraphQL response", async () => {
    planned = [{ status: 200, body: { errors: [{ path: ["cart"] }] } }];

    await expect(graphql.executeRaw(GET_CART, { storeId: "store-1" })).rejects.toThrow("unexpected response body");
  });
});

function documentOf<TResult, TVariables>(text: string): GraphqlDocument<TResult, TVariables> {
  return {
    toString(): string {
      return text;
    },
  };
}

function handle(incoming: IncomingMessage, outgoing: ServerResponse): void {
  const chunks: Buffer[] = [];
  incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
  incoming.on("end", () => {
    received.push({ path: incoming.url ?? "", body: JSON.parse(Buffer.concat(chunks).toString()) });
    const { status, body } = planned.shift() ?? { status: 200, body: { data: CART_DATA } };
    outgoing
      .writeHead(status, { "content-type": "application/json" })
      .end(typeof body === "string" ? body : JSON.stringify(body));
  });
}
