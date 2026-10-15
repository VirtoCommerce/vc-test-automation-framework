import type { CollectionSpec } from "@dataset/manifest";

import { expect, test } from "@playwright/test";

import { loadDataset } from "@dataset/dataset";
import { COLLECTION_NAMES, MANIFEST } from "@dataset/manifest";
import { findPathOf, seedRequests, storedIdSearchOf } from "@dataset/seed/seed-requests";

const ENV = {
  STORE_ID: "store under test",
  FRONTEND_BASE_URL: "https://frontend.example.com",
  USERS_PASSWORD: "seed-requests-password",
  GOOGLE_MAPS_API_KEY: "",
};

const EACH: CollectionSpec = {
  module: { id: "Module" },
  method: "POST",
  endpoint: "/api/items",
  send: "each",
  repeat: "upsert",
};

test.describe("seedRequests", () => {
  test("sends one request with every record for send: all", () => {
    const records = [{ name: "Brand" }, { name: "Color" }];
    const spec: CollectionSpec = { ...EACH, endpoint: "/api/stores/${ENV:STORE_ID}/properties", send: "all" };

    expect(seedRequests(spec, records, ENV)).toEqual([
      {
        label: "2 records",
        path: "/api/stores/store%20under%20test/properties",
        findPath: undefined,
        ifMatchPath: undefined,
        body: records,
      },
    ]);
  });

  test("sends nothing for an empty collection with send: all, so the platform's records are kept", () => {
    const spec: CollectionSpec = { ...EACH, send: "all" };

    expect(seedRequests(spec, [], ENV)).toEqual([]);
  });

  test("sends one request per record for send: each, in file order", () => {
    const records = [{ id: "item-b" }, { id: "item-a" }];

    expect(seedRequests(EACH, records, ENV)).toEqual([
      { label: 'record "item-b"', path: "/api/items", findPath: undefined, ifMatchPath: undefined, body: records[0] },
      { label: 'record "item-a"', path: "/api/items", findPath: undefined, ifMatchPath: undefined, body: records[1] },
    ]);
  });

  test("fills the record and environment into the stored-id search, or gives none without storedIdFrom", () => {
    const spec: CollectionSpec = {
      ...EACH,
      storedIdFrom: {
        search: "/api/${ENV:STORE_ID}/search",
        criteria: { storeId: "${ENV:STORE_ID}", codes: ["${RECORD:code}"], withoutTransient: true },
        match: "code",
      },
    };
    const record = { code: 'Fixed "Rate"' };

    expect(storedIdSearchOf(spec, record, ENV)).toEqual({
      path: "/api/store%20under%20test/search",
      criteria: { storeId: "store under test", codes: ['Fixed "Rate"'], withoutTransient: true },
      match: "code",
    });
    expect(storedIdSearchOf(EACH, record, ENV)).toBeUndefined();
  });

  test("gives one record's find path, or none for a collection without find", () => {
    const record = { id: "item/b" };

    expect(findPathOf({ ...EACH, find: "/api/items/${RECORD:id}" }, record, ENV)).toBe("/api/items/item%2Fb");
    expect(findPathOf(EACH, record, ENV)).toBeUndefined();
  });

  test("fills record fields into the path and the find path, URL-encoded", () => {
    const spec: CollectionSpec = {
      ...EACH,
      endpoint: "/api/products/${RECORD:productId}/prices",
      find: "/api/stores/${ENV:STORE_ID}/products/${RECORD:productId}",
    };

    const [request] = seedRequests(spec, [{ productId: "laptop/16 ai" }], ENV);

    expect(request?.path).toBe("/api/products/laptop%2F16%20ai/prices");
    expect(request?.findPath).toBe("/api/stores/store%20under%20test/products/laptop%2F16%20ai");
  });

  test("sends parents before their children", () => {
    const spec: CollectionSpec = { ...EACH, parentField: "parentId" };
    const records = [{ id: "child", parentId: "parent" }, { id: "other" }, { id: "parent" }];

    expect(seedRequests(spec, records, ENV).map(({ label }) => label)).toEqual([
      'record "other"',
      'record "parent"',
      'record "child"',
    ]);
  });

  test("names a record without an id by its first key, or by its position", () => {
    const keyed: CollectionSpec = { ...EACH, keys: [["productId", "fulfillmentCenterId"]] };

    expect(seedRequests(keyed, [{ productId: "laptop", fulfillmentCenterId: "canada" }], ENV)[0]?.label).toBe(
      'record "laptop + canada"',
    );
    expect(seedRequests(EACH, [{ name: "settings" }], ENV)[0]?.label).toBe("record #1");
  });

  for (const [title, spec, record, message] of [
    [
      "a record field the record lacks",
      { ...EACH, endpoint: "/api/products/${RECORD:productId}" },
      {},
      "${RECORD:productId} has no value",
    ],
    [
      "a record field in a path sent once for all records",
      { ...EACH, endpoint: "/api/products/${RECORD:productId}", send: "all" },
      { productId: "laptop" },
      "${RECORD:productId} has an unknown source; known sources: ENV",
    ],
    ["an unknown env key", { ...EACH, endpoint: "/api/${ENV:STORE_CODE}" }, {}, "${ENV:STORE_CODE} has no value"],
  ] as const) {
    test(`throws for ${title}`, () => {
      expect(() => seedRequests(spec as CollectionSpec, [record], ENV)).toThrow(message);
    });
  }

  test("builds the requests of every collection of the real data", () => {
    const dataset = loadDataset(ENV);
    const unresolved = COLLECTION_NAMES.flatMap((name) => {
      const records = dataset[name].all() as readonly Readonly<Record<string, unknown>>[];
      return seedRequests(MANIFEST[name], records, ENV)
        .filter(({ path, findPath }) => `${path}${findPath ?? ""}`.includes("${"))
        .map(({ label }) => `${name} ${label}`);
    });

    expect(unresolved).toEqual([]);
  });
});
