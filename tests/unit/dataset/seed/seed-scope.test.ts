import { expect, test } from "@playwright/test";

import { COLLECTION_NAMES, isCollectionName, MANIFEST } from "@dataset/manifest";
import { parseSeedOnly, resolveSeedScope } from "@dataset/seed/seed-scope";

const ALL_MODULES: ReadonlySet<string> = new Set(COLLECTION_NAMES.map((name) => MANIFEST[name].moduleId));

function without(moduleId: string): ReadonlySet<string> {
  return new Set([...ALL_MODULES].filter((id) => id !== moduleId));
}

test.describe("resolveSeedScope", () => {
  test("seeds every collection in seed order when nothing is limited and everything is installed", () => {
    expect(resolveSeedScope(ALL_MODULES, undefined)).toEqual({
      partial: false,
      collections: COLLECTION_NAMES,
      skipped: [],
    });
  });

  test("skips the collections whose module is not installed", () => {
    const scope = resolveSeedScope(without("VirtoCommerce.XPickup"), undefined);

    expect(scope.skipped).toEqual(["pickupLocations"]);
    expect(scope.collections).toEqual(COLLECTION_NAMES.filter((name) => name !== "pickupLocations"));
  });

  test("seeds only the listed collections, in seed order", () => {
    const scope = resolveSeedScope(ALL_MODULES, ["prices", "users", "products", "users"]);

    expect(scope).toEqual({ partial: true, collections: ["products", "prices", "users"], skipped: [] });
  });

  test("reports a listed collection whose module is not installed as skipped", () => {
    const scope = resolveSeedScope(without("VirtoCommerce.XPickup"), ["pickupLocations", "users"]);

    expect(scope).toEqual({ partial: true, collections: ["users"], skipped: ["pickupLocations"] });
  });

  test("seeds nothing when no module is installed", () => {
    const scope = resolveSeedScope(new Set(), undefined);

    expect(scope.collections).toEqual([]);
    expect(scope.skipped).toEqual(COLLECTION_NAMES);
  });
});

test.describe("parseSeedOnly", () => {
  test("means a full seed when not set", () => {
    expect(parseSeedOnly(undefined)).toBeUndefined();
  });

  test("reads names separated by commas, with spaces around them", () => {
    expect(parseSeedOnly(" users , products,prices ")).toEqual(["users", "products", "prices"]);
  });

  test("ignores empty items between commas", () => {
    expect(parseSeedOnly("users,,products,")).toEqual(["users", "products"]);
  });

  test("throws for a value that lists no collection", () => {
    expect(() => parseSeedOnly(" , ")).toThrow(
      "SEED_ONLY lists no collection; known collections: globalPlatformSettings",
    );
  });

  test("names every unknown collection and lists the known ones", () => {
    expect(() => parseSeedOnly("users,product,Prices")).toThrow(
      `SEED_ONLY lists unknown collections: product, Prices; known: ${COLLECTION_NAMES.join(", ")}`,
    );
  });
});

test.describe("isCollectionName", () => {
  test("accepts exact collection names only", () => {
    expect(isCollectionName("productInventories")).toBe(true);
    expect(isCollectionName("product-inventories")).toBe(false);
    expect(isCollectionName("toString")).toBe(false);
  });
});
