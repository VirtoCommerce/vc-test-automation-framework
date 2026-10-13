import { expect, test } from "@playwright/test";

import { optionalFields, requireDefined, requireFields, requireFieldsOfEach } from "@core/required-fields";

interface Product {
  readonly id?: string | null;
  readonly name?: string | null;
  readonly quantity?: number | null;
  readonly active?: boolean | null;
}

test.describe("requireFields", () => {
  test("returns the same value when every field is present", () => {
    const product: Product = { id: "laptop", name: "Laptop" };

    const checked = requireFields(product, ["id", "name"], "Product");

    expect(checked).toBe(product);
    expect(checked.id.toUpperCase()).toBe("LAPTOP");
  });

  test("accepts zero and false as present", () => {
    expect(() =>
      requireFields({ quantity: 0, active: false } as Product, ["quantity", "active"], "Product"),
    ).not.toThrow();
  });

  for (const [title, value] of [
    ["undefined", undefined],
    ["null", null],
  ] as const) {
    test(`throws when the value is ${title}`, () => {
      expect(() => requireFields<Product, "id">(value, ["id"], 'Product "laptop"')).toThrow(
        'Product "laptop" is missing',
      );
    });
  }

  for (const [title, product] of [
    ["undefined", {}],
    ["null", { id: null }],
    ["an empty string", { id: "" }],
  ] as const) {
    test(`counts ${title} as a missing field`, () => {
      expect(() => requireFields(product as Product, ["id"], "Product")).toThrow("Product has no id");
    });
  }

  test("names every missing field", () => {
    expect(() => requireFields({ quantity: 1 } as Product, ["id", "name", "quantity"], "Product")).toThrow(
      "Product has no id, name",
    );
  });
});

test.describe("optionalFields", () => {
  test("returns undefined for a value that was not found", () => {
    expect(optionalFields(undefined as Product | undefined, ["id"], "Product")).toBeUndefined();
  });

  test("returns the same value when every field is present", () => {
    const product: Product = { id: "laptop", name: "Laptop" };

    expect(optionalFields(product, ["id", "name"], "Product")).toBe(product);
  });

  test("throws for a found value that lacks a field", () => {
    expect(() => optionalFields({ id: "laptop" } as Product, ["id", "name"], "Product")).toThrow("Product has no name");
  });
});

test.describe("requireFieldsOfEach", () => {
  test("returns the same items when each has the fields", () => {
    const products: Product[] = [{ id: "a" }, { id: "b" }];

    const checked = requireFieldsOfEach(products, ["id"], "Found product");

    expect(checked).toEqual(products);
    expect(checked[1]).toBe(products[1]);
  });

  test("returns an empty list as it is", () => {
    expect(requireFieldsOfEach<Product, "id">([], ["id"], "Found product")).toEqual([]);
  });

  for (const [title, value] of [
    ["undefined", undefined],
    ["null", null],
  ] as const) {
    test(`throws when the list is ${title}, instead of treating it as empty`, () => {
      expect(() => requireFieldsOfEach<Product, "id">(value, ["id"], "Found product")).toThrow(
        "Found product is missing",
      );
    });
  }

  test("names the item that lacks a field by its position", () => {
    expect(() => requireFieldsOfEach([{ id: "a" }, { id: "" }] as Product[], ["id"], "Found product")).toThrow(
      "Found product #2 has no id",
    );
  });

  test("names a missing item by its position", () => {
    expect(() => requireFieldsOfEach([{ id: "a" }, null], ["id"], "Found product")).toThrow(
      "Found product #2 is missing",
    );
  });
});

test.describe("requireDefined", () => {
  test("returns the items when none is missing", () => {
    expect(requireDefined(["a", 0, false], "Value")).toEqual(["a", 0, false]);
  });

  for (const [title, value] of [
    ["undefined", undefined],
    ["null", null],
  ] as const) {
    test(`throws when the list is ${title}`, () => {
      expect(() => requireDefined<string>(value, "Order line")).toThrow("Order line is missing");
    });
  }

  for (const [title, value] of [
    ["undefined", undefined],
    ["null", null],
  ] as const) {
    test(`names a ${title} item by its position`, () => {
      expect(() => requireDefined(["a", value, "c"], "Order line")).toThrow("Order line #2 is missing");
    });
  }

  test("keeps an empty string as defined", () => {
    expect(requireDefined([""], "Value")).toEqual([""]);
  });
});
