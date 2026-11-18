import { expect, test } from "@playwright/test";

test.describe("prove-fails fixture", () => {
  test("adds two numbers", () => {
    const total = 2 + 2;
    expect(total).toBe(4);
  });
});
