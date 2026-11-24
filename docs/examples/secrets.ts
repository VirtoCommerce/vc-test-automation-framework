import { expect, test } from "@playwright/test";
import { maskSecrets, Secret } from "@virtocommerce/test-automation-framework/core";

test("a secret never appears in output", () => {
  const password = Secret.of("Password1!");

  expect(`${password}`).toBe("[SECRET]");
  expect(JSON.stringify({ password })).toBe('{"password":"[SECRET]"}');
  expect(maskSecrets("password=Password1%21")).toBe("password=[SECRET]");
  expect(password.reveal()).toBe("Password1!");
});
