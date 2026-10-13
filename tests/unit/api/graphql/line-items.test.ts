import { expect, test } from "@playwright/test";

import { lineItemOf } from "@api/graphql/line-items";

const CART = {
  items: [null, { id: "line-1", productId: "product-a", quantity: 1 }, { id: "line-2", productId: "product-b" }],
};

test.describe("lineItemOf", () => {
  test("finds the line item of the product", () => {
    expect(lineItemOf(CART, "product-b")).toEqual({ id: "line-2", productId: "product-b" });
  });

  test("throws naming the product when the container has no line for it", () => {
    expect(() => lineItemOf(CART, "product-c")).toThrow('Line item of product "product-c" is missing');
  });

  test("throws when the container itself is missing", () => {
    expect(() => lineItemOf(null, "product-a")).toThrow('Line item of product "product-a" is missing');
  });
});
