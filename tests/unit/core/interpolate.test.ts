import { expect, test } from "@playwright/test";

import { interpolate, jsonStringContent } from "@core/interpolate";

const ENV: Readonly<Record<string, string>> = { STORE_ID: "store-acme", NAME: 'a "quoted" \\ name' };
const SOURCES = { ENV: (key: string) => ENV[key], RECORD: (key: string) => ({ productId: "laptop 1", size: 3 })[key] };

function keep(value: string): string {
  return value;
}

test.describe("interpolate", () => {
  test("replaces every placeholder from its source", () => {
    expect(interpolate("/api/${ENV:STORE_ID}/products/${RECORD:productId}/${ENV:STORE_ID}", SOURCES, keep)).toBe(
      "/api/store-acme/products/laptop 1/store-acme",
    );
  });

  test("encodes each value", () => {
    expect(interpolate("/api/products/${RECORD:productId}", SOURCES, encodeURIComponent)).toBe(
      "/api/products/laptop%201",
    );
  });

  test("keeps text without placeholders unchanged", () => {
    expect(interpolate("/api/catalog/products", SOURCES, keep)).toBe("/api/catalog/products");
  });

  for (const [title, template, message] of [
    ["an unknown source", "${PAYLOAD_ITEM:id}", "${PAYLOAD_ITEM:id} has an unknown source; known sources: ENV, RECORD"],
    ["a key without a value", "${ENV:MISSING}", "${ENV:MISSING} has no value"],
    ["a value that is not a string", "${RECORD:size}", "${RECORD:size} has no value"],
    ["a placeholder without a source", "${STORE_ID}", "${STORE_ID} is not a placeholder of the form ${SOURCE:key}"],
    ["a placeholder without a key", "${ENV:}", "${ENV:} is not a placeholder of the form ${SOURCE:key}"],
    ["an empty placeholder", "${}", "${} is not a placeholder of the form ${SOURCE:key}"],
  ] as const) {
    test(`throws for ${title}`, () => {
      expect(() => interpolate(`/api/${template}`, SOURCES, keep)).toThrow(message);
    });
  }
});

test.describe("jsonStringContent", () => {
  test("escapes a value so it fits inside a JSON string", () => {
    const json = `{"name":"${interpolate("${ENV:NAME}", SOURCES, jsonStringContent)}"}`;

    expect(JSON.parse(json)).toEqual({ name: 'a "quoted" \\ name' });
  });

  test("leaves a plain value as it is", () => {
    expect(jsonStringContent("store-acme")).toBe("store-acme");
  });
});
