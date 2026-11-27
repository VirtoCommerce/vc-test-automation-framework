import { expect, test } from "@playwright/test";

import { defaultUse } from "@/core";

import { testEnv } from "./test-env.ts";

test.describe("defaultUse", () => {
  test("checks certificates and keeps the evidence of failed tests", () => {
    expect(defaultUse(testEnv())).toEqual({
      ignoreHTTPSErrors: false,
      trace: "retain-on-failure",
      screenshot: "only-on-failure",
      video: "retain-on-failure",
      testIdAttribute: "data-test-id",
    });
  });

  test("ignores certificate errors when VERIFY_SSL is off", () => {
    expect(defaultUse(testEnv({ VERIFY_SSL: "false" })).ignoreHTTPSErrors).toBe(true);
  });

  test("uses the given test id attribute", () => {
    expect(defaultUse(testEnv(), { testIdAttribute: "data-testid" }).testIdAttribute).toBe("data-testid");
  });
});
