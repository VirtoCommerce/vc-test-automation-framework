import { expect, test } from "@playwright/test";

import { uniqueId } from "@core/unique-id";

test.describe("uniqueId", () => {
  test("starts with the prefix and differs on every call", () => {
    const ids = [uniqueId("test-cart"), uniqueId("test-cart")];

    expect(ids[0]).toMatch(/^test-cart-[0-9a-f]{8}$/);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
