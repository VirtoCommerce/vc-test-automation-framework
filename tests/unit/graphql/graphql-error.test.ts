import type { GraphqlErrorEntry } from "@/graphql";

import { inspect } from "node:util";

import { expect, test } from "@playwright/test";

import { MASKED, Secret } from "@/core";
import { GraphqlError } from "@/graphql";
import { HttpError } from "@/http";

const QUANTITY: GraphqlErrorEntry = {
  message: "Quantity must be positive",
  path: ["addItem"],
  extensions: { code: "VALIDATION_ERROR" },
};

const MISSING: GraphqlErrorEntry = { message: "Cart not found", path: ["cart", "items", 0] };

test.describe("GraphqlError", () => {
  test("is an Error with the name GraphqlError", () => {
    const error = new GraphqlError("AddItem", 200, [QUANTITY]);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("GraphqlError");
    expect(String(error)).toMatch(/^GraphqlError: /);
  });

  test("keeps the operation name, status and entries", () => {
    const error = new GraphqlError("AddItem", 400, [QUANTITY, MISSING]);

    expect(error.operationName).toBe("AddItem");
    expect(error.status).toBe(400);
    expect(error.errors).toEqual([QUANTITY, MISSING]);
  });

  test("names the operation and status, then lists each error with its code and path", () => {
    const error = new GraphqlError("AddItem", 400, [QUANTITY, MISSING]);

    expect(error.message).toBe(
      [
        "GraphQL operation AddItem returned 2 errors with status 400:",
        "  - [VALIDATION_ERROR] Quantity must be positive (at addItem)",
        "  - Cart not found (at cart.items.0)",
      ].join("\n"),
    );
  });

  test("uses the singular for one error", () => {
    expect(new GraphqlError("AddItem", 200, [QUANTITY]).message).toMatch(/returned 1 error with status 200:\n/);
  });

  test("lists an error without a code or path by its message only", () => {
    expect(new GraphqlError("GetCart", 200, [{ message: "Internal error" }]).message).toMatch(
      /\n {2}- Internal error$/,
    );
  });

  test("reports a response without data and without errors", () => {
    const error = new GraphqlError("(anonymous)", 200, []);

    expect(error.message).toBe("GraphQL operation (anonymous) returned no data with status 200");
    expect(error.errors).toEqual([]);
  });

  test("keeps fields that the server adds", () => {
    const entry: GraphqlErrorEntry = { message: "Syntax error", locations: [{ line: 1, column: 7 }] };

    expect(new GraphqlError("GetCart", 400, [entry]).errors[0]).toEqual(entry);
  });

  test("masks a registered secret in the message", () => {
    Secret.of("Graphql-Message-Secret-1");

    const error = new GraphqlError("SignIn", 400, [{ message: "Variable got invalid value Graphql-Message-Secret-1" }]);

    expect(error.message).toContain(`invalid value ${MASKED}`);
    expect(error.message).not.toContain("Graphql-Message-Secret-1");
  });

  test("masks a registered secret in the entries, including their extensions", () => {
    Secret.of("Graphql-Entry-Secret-1");
    const entry: GraphqlErrorEntry = {
      message: "Invalid password Graphql-Entry-Secret-1",
      extensions: { code: "INVALID", input: { password: "Graphql-Entry-Secret-1" } },
    };

    const error = new GraphqlError("SignIn", 400, [entry]);

    expect(error.errors).toEqual([
      { message: `Invalid password ${MASKED}`, extensions: { code: "INVALID", input: { password: MASKED } } },
    ]);
    expect(inspect(error, { depth: null })).not.toContain("Graphql-Entry-Secret-1");
  });
});

test.describe("GraphqlError.hasCode", () => {
  const error = new GraphqlError("AddItem", 200, [MISSING, QUANTITY]);

  test("returns true when an entry has the code", () => {
    expect(GraphqlError.hasCode(error, "VALIDATION_ERROR")).toBe(true);
  });

  test("returns true when an entry has one of several codes", () => {
    expect(GraphqlError.hasCode(error, "NOT_FOUND", "VALIDATION_ERROR")).toBe(true);
  });

  test("returns false when no entry has the code", () => {
    expect(GraphqlError.hasCode(error, "NOT_FOUND")).toBe(false);
  });

  test("returns false without codes", () => {
    expect(GraphqlError.hasCode(error)).toBe(false);
  });

  test("ignores a code that is not a string", () => {
    expect(
      GraphqlError.hasCode(new GraphqlError("AddItem", 200, [{ message: "x", extensions: { code: 42 } }]), "42"),
    ).toBe(false);
  });

  for (const value of [
    new Error("VALIDATION_ERROR"),
    new HttpError("GET /graphql", 400),
    "VALIDATION_ERROR",
    undefined,
  ]) {
    test(`returns false for ${inspect(value, { breakLength: Infinity }).split("\n")[0]}`, () => {
      expect(GraphqlError.hasCode(value, "VALIDATION_ERROR")).toBe(false);
    });
  }
});
