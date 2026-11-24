import { expect, test } from "@playwright/test";

import { Collection } from "@/dataset";

type Product = { readonly id?: string; readonly name: string };

const PRODUCTS = new Collection<Product>("products", [
  { id: "product-1", name: "Laptop" },
  { name: "No identifier" },
  { id: "product-2", name: "Phone" },
]);

test.describe("Collection", () => {
  test("counts and returns its records in order", () => {
    expect(PRODUCTS.name).toBe("products");
    expect(PRODUCTS.count).toBe(3);
    expect(PRODUCTS.all().map((product) => product.name)).toEqual(["Laptop", "No identifier", "Phone"]);
  });

  test("keeps a frozen copy of its records", () => {
    const records: Product[] = [{ name: "Laptop" }];
    const collection = new Collection("products", records);
    records.push({ name: "Phone" });

    expect(collection.count).toBe(1);
    expect(Object.isFrozen(collection.all())).toBe(true);
  });

  test("returns a record by its identifier and skips records without one", () => {
    expect(PRODUCTS.get("product-2")).toEqual({ id: "product-2", name: "Phone" });
  });

  test("throws for an unknown identifier", () => {
    expect(() => PRODUCTS.get("product-3")).toThrow('The dataset collection products has no record "product-3"');
  });

  test("throws when two records share an identifier", () => {
    const duplicated = new Collection<Product>("products", [
      { id: "product-1", name: "Laptop" },
      { id: "product-1", name: "Phone" },
    ]);

    expect(() => duplicated.get("product-1")).toThrow(
      'The dataset collection products has more than one record "product-1"',
    );
  });

  test("returns the records that match a condition", () => {
    expect(PRODUCTS.filter((product) => product.id !== undefined).map((product) => product.name)).toEqual([
      "Laptop",
      "Phone",
    ]);
  });
});
