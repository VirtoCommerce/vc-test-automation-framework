import { expect, test } from "@playwright/test";

import { uniqueId, uniqueName } from "@core/unique-id";

test.describe("uniqueId", () => {
  test("starts with the prefix and differs on every call", () => {
    const ids = [uniqueId("test-cart"), uniqueId("test-cart")];

    expect(ids[0]).toMatch(/^test-cart-[0-9a-f]{8}$/);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

test.describe("uniqueName", () => {
  test("is the prefix and eight letters, different on every call", () => {
    const names = [uniqueName("Customer"), uniqueName("Customer")];

    expect(names[0]).toMatch(/^Customer [A-Z][a-z]{7}$/);
    expect(names[0]).not.toBe(names[1]);
  });
});
