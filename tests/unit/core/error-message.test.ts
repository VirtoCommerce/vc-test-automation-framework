import { expect, test } from "@playwright/test";

import { errorMessage } from "@/core";

test.describe("errorMessage", () => {
  test("returns the message of an Error", () => {
    expect(errorMessage(new TypeError("not a function"))).toBe("not a function");
  });

  test("returns any other thrown value as a string", () => {
    expect(errorMessage("timed out")).toBe("timed out");
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});
