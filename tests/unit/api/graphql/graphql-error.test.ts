import { expect, test } from "@playwright/test";

import { GraphqlError } from "@api/graphql/graphql-error";
import { MASK, Secret } from "@core/secret";

test.describe("GraphqlError", () => {
  test("is an Error with its name, operation, status and entries", () => {
    const entries = [{ message: "Cart not found" }];

    const error = new GraphqlError("GetCart", 200, entries);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("GraphqlError");
    expect(error.operationName).toBe("GetCart");
    expect(error.status).toBe(200);
    expect(error.errors).toBe(entries);
  });

  test("lists every error with its code and path", () => {
    const error = new GraphqlError("AddItem", 400, [
      { message: "Quantity must be positive", path: ["addItem", 0, "quantity"], extensions: { code: "VALIDATION" } },
      { message: "Product not found" },
    ]);

    expect(error.message).toBe(
      [
        "GraphQL operation AddItem returned 2 error(s) with status 400:",
        "  - [VALIDATION] Quantity must be positive (at addItem.0.quantity)",
        "  - Product not found",
      ].join("\n"),
    );
  });

  test("ignores a code that is not a string", () => {
    const error = new GraphqlError("GetCart", 200, [{ message: "failed", extensions: { code: 42 } }]);

    expect(error.message).toContain("\n  - failed");
  });

  test("masks known secrets in the message and keeps the entries as received", () => {
    const password = new Secret("graphql-error-password-1");
    const entry = { message: `Variable "$command" got invalid value {"password":"${password.reveal()}"}` };

    const error = new GraphqlError("CreateUser", 400, [entry]);

    expect(error.message).toContain(`"password":"${MASK}"`);
    expect(error.message).not.toContain(password.reveal());
    expect(error.stack).not.toContain(password.reveal());
    expect(error.errors).toEqual([entry]);
  });
});
