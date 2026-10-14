import { expect, test } from "@playwright/test";

import { COLLECTION_NAMES, isCollectionName, MANIFEST } from "@dataset/manifest";
import { MODULES } from "@dataset/modules";
import { parseSeedOnly, resolveSeedScope } from "@dataset/seed/seed-scope";

const NEWEST = "9.9999.0";
const ALL_MODULES: ReadonlyMap<string, string> = new Map(
  COLLECTION_NAMES.map((name) => [MANIFEST[name].module.id, NEWEST]),
);

function installedWith(changes: Readonly<Record<string, string | undefined>>): ReadonlyMap<string, string> {
  const installed = new Map(ALL_MODULES);
  for (const [id, version] of Object.entries(changes)) {
    if (version === undefined) {
      installed.delete(id);
    } else {
      installed.set(id, version);
    }
  }
  return installed;
}

test.describe("resolveSeedScope", () => {
  test("seeds every collection in seed order when nothing is limited and everything qualifies", () => {
    expect(resolveSeedScope(ALL_MODULES, undefined)).toEqual({
      partial: false,
      collections: COLLECTION_NAMES,
      skipped: [],
    });
  });

  test("skips the collections whose module is not installed, with the reason", () => {
    const scope = resolveSeedScope(installedWith({ [MODULES.pickup.id]: undefined }), undefined);

    expect(scope.skipped).toEqual([{ name: "pickupLocations", reason: "VirtoCommerce.XPickup is not installed" }]);
    expect(scope.collections).toEqual(COLLECTION_NAMES.filter((name) => name !== "pickupLocations"));
  });

  test("skips the collections whose module is older than their range, with the reason", () => {
    const scope = resolveSeedScope(installedWith({ [MODULES.pageBuilder.id]: "3.1012.1" }), undefined);
    const reason = `VirtoCommerce.PageBuilderModule 3.1012.1 is older than ${MODULES.pageBuilder.minVersion}`;

    expect(scope.skipped).toEqual([
      { name: "pages", reason },
      { name: "pagesContent", reason },
    ]);
  });

  test("seeds only the listed collections, in seed order", () => {
    const scope = resolveSeedScope(ALL_MODULES, ["prices", "users", "products", "users"]);

    expect(scope).toEqual({ partial: true, collections: ["products", "prices", "users"], skipped: [] });
  });

  test("reports a listed collection whose module is not installed as skipped", () => {
    const scope = resolveSeedScope(installedWith({ [MODULES.pickup.id]: undefined }), ["pickupLocations", "users"]);

    expect(scope).toEqual({
      partial: true,
      collections: ["users"],
      skipped: [{ name: "pickupLocations", reason: "VirtoCommerce.XPickup is not installed" }],
    });
  });

  test("seeds nothing when no module is installed", () => {
    const scope = resolveSeedScope(new Map(), undefined);

    expect(scope.collections).toEqual([]);
    expect(scope.skipped.map(({ name }) => name)).toEqual(COLLECTION_NAMES);
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
