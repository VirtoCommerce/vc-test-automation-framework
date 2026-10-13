import { expect, test } from "@playwright/test";

import { Collection } from "@dataset/collection";

interface Product {
  readonly id?: string | null;
  readonly name: string;
}

const LAPTOP: Product = { id: "product-laptop", name: "Laptop" };
const PHONE: Product = { id: "product-phone", name: "Phone" };
const NO_ID: Product = { name: "Without id" };

test.describe("Collection", () => {
  test("has its name, size and records in file order", () => {
    const products = new Collection("products", [LAPTOP, PHONE, NO_ID]);

    expect(products.name).toBe("products");
    expect(products.size).toBe(3);
    expect(products.all()).toEqual([LAPTOP, PHONE, NO_ID]);
  });

  test("gets a record by id", () => {
    expect(new Collection("products", [LAPTOP, PHONE]).get("product-phone")).toBe(PHONE);
  });

  test("throws for a missing id, naming the collection", () => {
    expect(() => new Collection("products", [LAPTOP]).get("product-tablet")).toThrow(
      'Dataset products has no record "product-tablet"',
    );
  });

  test("ignores records without an id", () => {
    expect(new Collection("products", [NO_ID, LAPTOP]).get("product-laptop")).toBe(LAPTOP);
  });

  test("reports a duplicate id on the first lookup", () => {
    const products = new Collection("products", [LAPTOP, { id: "product-laptop", name: "Copy" }]);

    expect(() => products.get("product-phone")).toThrow('Dataset products has more than one record "product-laptop"');
  });

  test("filters records in file order", () => {
    const products = new Collection("products", [LAPTOP, PHONE, NO_ID]);

    expect(products.filter((product) => product.name.includes("o"))).toEqual([LAPTOP, PHONE, NO_ID]);
    expect(products.filter((product) => product.id === undefined)).toEqual([NO_ID]);
  });
});
