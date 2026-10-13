import type { Server } from "node:http";
import type { APIRequestContext } from "@playwright/test";
import type { GraphqlDocument } from "@api/graphql/graphql-client";

import { createServer } from "node:http";

import { expect, test } from "@playwright/test";

import { GraphqlClient } from "@api/graphql/graphql-client";
import { GraphqlError } from "@api/graphql/graphql-error";
import { HttpClient } from "@api/http/http-client";
import { HttpError } from "@api/http/http-error";

interface Received {
  readonly path: string;
  readonly body: { readonly query: string; readonly operationName?: string; readonly variables: unknown };
}

const ANSWERS: Readonly<Record<string, readonly [status: number, body: string]>> = {
  GetThing: [200, JSON.stringify({ data: { thing: { id: "thing-1" } } })],
  FailsWith200: [200, JSON.stringify({ data: null, errors: [{ message: "Thing not found", path: ["thing"] }] })],
  FailsWith400: [400, JSON.stringify({ errors: [{ message: "Variable $id is required" }] })],
  PartialData: [200, JSON.stringify({ data: { thing: null }, errors: [{ message: "Denied" }] })],
  NoData: [200, JSON.stringify({})],
  ServerError: [500, JSON.stringify({ message: "boom" })],
  ProxyError: [502, "<html>Bad Gateway</html>"],
  Malformed: [200, JSON.stringify({ errors: [{ code: 1 }] })],
};

let server: Server;
let context: APIRequestContext;
let received: Received | undefined;

test.beforeAll(async ({ playwright }) => {
  server = createServer((request, response) => {
    let text = "";
    request.on("data", (chunk: Buffer) => {
      text += chunk.toString("utf8");
    });
    request.on("end", () => {
      const body = JSON.parse(text) as Received["body"];
      received = { path: request.url ?? "", body };
      const [status, answer] = ANSWERS[body.operationName ?? "GetThing"] ?? [200, "{}"];
      const contentType = answer.startsWith("<") ? "text/html" : "application/json";
      response.writeHead(status, { "Content-Type": contentType }).end(answer);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the GraphQL stub has no port");
  }
  context = await playwright.request.newContext({ baseURL: `http://127.0.0.1:${address.port}` });
});

test.afterAll(async () => {
  await context.dispose();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

function operation<R, V>(text: string): GraphqlDocument<R, V> {
  return { toString: () => text } as GraphqlDocument<R, V>;
}

const GetThing = operation<{ thing: { id: string } }, { id: string }>(
  "query GetThing($id: String!) { thing(id: $id) { id } }",
);

function named(name: string): GraphqlDocument<{ thing: { id: string } | null }, Record<string, never>> {
  return operation(`query ${name} { thing { id } }`);
}

function graphql(): GraphqlClient {
  return new GraphqlClient(new HttpClient(context));
}

test.describe("GraphqlClient", () => {
  test.describe("execute", () => {
    test("sends the query, operation name and variables and returns the data", async () => {
      const data = await graphql().execute(GetThing, { id: "thing-1" });

      expect(data).toEqual({ thing: { id: "thing-1" } });
      expect(received).toEqual({
        path: "/graphql",
        body: {
          query: "query GetThing($id: String!) { thing(id: $id) { id } }",
          operationName: "GetThing",
          variables: { id: "thing-1" },
        },
      });
    });

    test("sends empty variables for an operation without any", async () => {
      await graphql().execute(named("GetThing"));

      expect(received?.body.variables).toEqual({});
    });

    test("throws a GraphqlError with the entries for errors with a success status", async () => {
      const error = await graphql()
        .execute(named("FailsWith200"))
        .catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(GraphqlError);
      expect(error).toMatchObject({ operationName: "FailsWith200", status: 200 });
      expect((error as GraphqlError).errors).toEqual([{ message: "Thing not found", path: ["thing"] }]);
    });

    test("throws a GraphqlError for errors with an error status", async () => {
      await expect(graphql().execute(named("FailsWith400"))).rejects.toMatchObject({
        name: "GraphqlError",
        status: 400,
      });
    });

    test("throws for partial data with errors", async () => {
      await expect(graphql().execute(named("PartialData"))).rejects.toBeInstanceOf(GraphqlError);
    });

    test("throws a GraphqlError when there is neither data nor an error", async () => {
      await expect(graphql().execute(named("NoData"))).rejects.toThrow("response has no data");
    });
  });

  test.describe("executeRaw", () => {
    test("returns the data with no errors", async () => {
      expect(await graphql().executeRaw(GetThing, { id: "thing-1" })).toEqual({
        operationName: "GetThing",
        status: 200,
        data: { thing: { id: "thing-1" } },
        errors: [],
      });
    });

    test("returns errors that come with an error status", async () => {
      const result = await graphql().executeRaw(named("FailsWith400"));

      expect(result).toEqual({
        operationName: "FailsWith400",
        status: 400,
        data: null,
        errors: [{ message: "Variable $id is required" }],
      });
    });

    test("returns partial data together with its errors", async () => {
      const result = await graphql().executeRaw(named("PartialData"));

      expect(result.data).toEqual({ thing: null });
      expect(result.errors).toEqual([{ message: "Denied" }]);
    });

    test("names an operation without a name anonymous", async () => {
      const result = await graphql().executeRaw(operation<unknown, Record<string, never>>("{ thing { id } }"));

      expect(result.operationName).toBe("(anonymous)");
      expect(received?.body.operationName).toBeUndefined();
    });
  });

  test.describe("failures that are not GraphQL errors", () => {
    for (const [name, status] of [
      ["ServerError", 500],
      ["ProxyError", 502],
    ] as const) {
      test(`throws an HttpError for a ${status} without GraphQL errors`, async () => {
        const error = await graphql()
          .executeRaw(named(name))
          .catch((reason: unknown) => reason);

        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).status).toBe(status);
      });
    }

    test("throws an HttpError for a body that is not a GraphQL response", async () => {
      const error = await graphql()
        .executeRaw(named("Malformed"))
        .catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(HttpError);
      expect(String(error)).toContain("unexpected response body");
    });
  });
});
