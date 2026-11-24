import { expect, test } from "@playwright/test";

import { isCi } from "@/core";

test.describe("isCi", () => {
  for (const value of ["true", "1", "yes", " TRUE "]) {
    test(`is true when CI is "${value}"`, () => {
      expect(isCi({ CI: value })).toBe(true);
    });
  }

  for (const value of ["", "  ", "false", "FALSE", "0"]) {
    test(`is false when CI is "${value}"`, () => {
      expect(isCi({ CI: value })).toBe(false);
    });
  }

  test("is false when CI is not set", () => {
    expect(isCi({})).toBe(false);
  });
});
