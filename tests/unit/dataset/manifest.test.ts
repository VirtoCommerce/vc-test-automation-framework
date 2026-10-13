import { expect, test } from "@playwright/test";

import { COLLECTION_NAMES, collectionDir, MANIFEST } from "@dataset/manifest";

test.describe("collectionDir", () => {
  for (const [name, dir] of [
    ["products", "products"],
    ["productInventories", "product-inventories"],
    ["globalPlatformSettings", "global-platform-settings"],
    ["pagesContent", "pages-content"],
  ] as const) {
    test(`maps ${name} to ${dir}`, () => {
      expect(collectionDir(name)).toBe(dir);
    });
  }
});

test.describe("MANIFEST", () => {
  test("lists the collection names in seed order", () => {
    expect(COLLECTION_NAMES).toEqual(Object.keys(MANIFEST));
    expect(COLLECTION_NAMES.indexOf("catalogs")).toBeLessThan(COLLECTION_NAMES.indexOf("products"));
    expect(COLLECTION_NAMES.indexOf("products")).toBeLessThan(COLLECTION_NAMES.indexOf("prices"));
  });

  test("finds existing records only for collections sent one by one", () => {
    for (const name of COLLECTION_NAMES) {
      const spec: { readonly find?: string; readonly send: string } = MANIFEST[name];
      if (spec.find !== undefined) {
        expect(spec.send, name).toBe("each");
      }
    }
  });
});
