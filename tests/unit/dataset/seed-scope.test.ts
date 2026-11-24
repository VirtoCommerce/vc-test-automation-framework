import { expect, test } from "@playwright/test";

import { parseCollectionNames } from "@/dataset";

const MODULE = { id: "VirtoCommerce.Catalog" };
const MANIFEST = {
  catalogs: { module: MODULE, method: "POST", path: "/api/catalog/catalogs", send: "each" },
  pickupLocations: { module: MODULE, method: "POST", path: "/api/pickup-locations", send: "each" },
  prices: { module: MODULE, method: "PUT", path: "/api/products/prices", send: "all" },
  products: { module: MODULE, method: "POST", path: "/api/catalog/products", send: "all" },
} as const;

test.describe("parseCollectionNames", () => {
  test("returns undefined for every collection", () => {
    expect(parseCollectionNames(MANIFEST, undefined)).toBeUndefined();
  });

  test("parses a list and ignores spaces and empty entries", () => {
    expect(parseCollectionNames(MANIFEST, " products, ,prices ")).toEqual(["products", "prices"]);
  });

  test("throws for a list without names", () => {
    expect(() => parseCollectionNames(MANIFEST, " , ")).toThrow(
      "The list names no collection; the known collections are catalogs, pickupLocations, prices, products",
    );
  });

  test("throws for unknown names", () => {
    expect(() => parseCollectionNames(MANIFEST, "products, orders, carts")).toThrow(
      "The list names unknown collections: orders, carts; the known collections are",
    );
  });
});
