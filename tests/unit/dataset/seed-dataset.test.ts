import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { APIRequestContext } from "@playwright/test";
import type { CollectionName, Manifest, SeedEvent, SeedRun, SeedSummary } from "@/dataset";

import { createServer } from "node:http";

import { expect, request, test } from "@playwright/test";

import { MASKED, Secret } from "@/core";
import { Collection, envPlaceholder, recordPlaceholder, seedDataset } from "@/dataset";
import { HttpClient, HttpError } from "@/http";
import { InstalledModules } from "@/modules";

type Received = { readonly request: string; readonly ifMatch?: string; readonly body?: unknown };
type Reply = { readonly status: number; readonly body?: string; readonly headers?: Record<string, string> };
type Records<TManifest extends Manifest> = Partial<Record<CollectionName<TManifest>, readonly object[]>>;
type Options<TManifest extends Manifest> = Omit<SeedRun<TManifest>, "http" | "manifest" | "dataset" | "installed">;

const MODULE = { id: "VirtoCommerce.Catalog" };
const INSTALLED = new InstalledModules({ "VirtoCommerce.Catalog": "3.1051.0" });

let server: Server;
let context: APIRequestContext;
let httpClient: HttpClient;
let received: Received[] = [];
let replies: Record<string, Reply> = {};

test.beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context = await request.newContext();
  httpClient = new HttpClient(context, `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

test.afterAll(async () => {
  await context.dispose();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  received = [];
  replies = {};
});

function handle(incoming: IncomingMessage, outgoing: ServerResponse): void {
  const chunks: Buffer[] = [];
  incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
  incoming.on("end", () => {
    const key = `${incoming.method} ${incoming.url}`;
    const text = Buffer.concat(chunks).toString();
    const ifMatch = incoming.headers["if-match"];
    received.push({
      request: key,
      ...(ifMatch === undefined ? {} : { ifMatch }),
      ...(text === "" ? {} : { body: JSON.parse(text) }),
    });
    const reply = replies[key] ?? { status: incoming.method === "GET" ? 404 : 204 };
    outgoing.writeHead(reply.status, { "content-type": "application/json", ...reply.headers }).end(reply.body ?? "");
  });
}

function json(status: number, body: unknown, headers?: Record<string, string>): Reply {
  return { status, body: JSON.stringify(body), ...(headers === undefined ? {} : { headers }) };
}

function seed<TManifest extends Manifest>(
  manifest: TManifest,
  records: Records<TManifest>,
  options: Options<TManifest> = {},
): Promise<SeedSummary<TManifest>> {
  const names = Object.keys(manifest) as CollectionName<TManifest>[];
  const dataset = Object.fromEntries(
    names.map((name) => [name, new Collection(name, records[name] ?? [])]),
  ) as SeedRun<TManifest>["dataset"];
  return seedDataset({
    http: httpClient,
    manifest,
    dataset,
    installed: INSTALLED,
    ...options,
  });
}

async function seedError<TManifest extends Manifest>(manifest: TManifest, records: Records<TManifest>): Promise<Error> {
  try {
    await seed(manifest, records);
  } catch (error) {
    return error as Error;
  }
  throw new Error("The seed run did not fail");
}

test.describe("seedDataset requests", () => {
  test("sends one request for each record, with the placeholders of the path URL-encoded", async () => {
    const manifest = {
      items: {
        module: MODULE,
        method: "PUT",
        path: `/api/stores/${envPlaceholder("STORE")}/items/${recordPlaceholder("id")}`,
        send: "each",
      },
    } as const;

    const summary = await seed(
      manifest,
      { items: [{ id: "item 1" }, { id: "item/2" }] },
      {
        placeholders: { STORE: Secret.of("store-secret-1") },
      },
    );

    expect(received).toEqual([
      { request: "PUT /api/stores/store-secret-1/items/item%201", body: { id: "item 1" } },
      { request: "PUT /api/stores/store-secret-1/items/item%2F2", body: { id: "item/2" } },
    ]);
    expect(summary).toEqual({ collections: ["items"], skipped: [], sent: 2, existing: 0 });
  });

  test("sends one request with every record of a collection", async () => {
    const manifest = { prices: { module: MODULE, method: "PUT", path: "/api/prices", send: "all" } } as const;

    const summary = await seed(manifest, { prices: [{ price: 1 }, { price: 2 }] });

    expect(received).toEqual([{ request: "PUT /api/prices", body: [{ price: 1 }, { price: 2 }] }]);
    expect(summary).toEqual({ collections: ["prices"], skipped: [], sent: 2, existing: 0 });
  });

  test("skips a collection without records", async () => {
    const manifest = { prices: { module: MODULE, method: "PUT", path: "/api/prices", send: "all" } } as const;

    const summary = await seed(manifest, {});

    expect(received).toEqual([]);
    expect(summary).toEqual({
      collections: [],
      skipped: [{ name: "prices", reason: "no records" }],
      sent: 0,
      existing: 0,
    });
  });

  test("sends parents before their children", async () => {
    const manifest = {
      categories: { module: MODULE, method: "POST", path: "/api/categories", send: "each", parentField: "parentId" },
    } as const;

    await seed(manifest, {
      categories: [
        { id: "grandchild", parentId: "child" },
        { id: "child", parentId: "root" },
        { id: "root", parentId: "catalog-category" },
      ],
    });

    expect(received.map((entry) => (entry.body as { id: string }).id)).toEqual(["root", "child", "grandchild"]);
  });

  test("reports records that reference each other as parents", async () => {
    const manifest = {
      categories: { module: MODULE, method: "POST", path: "/api/categories", send: "each", parentField: "parentId" },
    } as const;

    await expect(
      seed(manifest, {
        categories: [
          { id: "a", parentId: "b" },
          { id: "b", parentId: "a" },
        ],
      }),
    ).rejects.toThrow("categories: The records reference each other as parents: a → b → a");
  });
});

test.describe("seedDataset stored records", () => {
  const EACH = {
    catalogs: {
      module: MODULE,
      method: "POST",
      path: "/api/catalogs",
      findPath: `/api/catalogs/${recordPlaceholder("id")}`,
      send: "each",
    },
  } as const;
  const ALL = {
    inventories: {
      module: MODULE,
      method: "PUT",
      path: "/api/inventories",
      findPath: `/api/inventories/${recordPlaceholder("productId")}`,
      send: "all",
      key: "productId",
    },
  } as const;

  test("leaves a record that its find path finds, and sends one that it does not find", async () => {
    replies = {
      "GET /api/catalogs/stored": json(200, { id: "stored" }),
      "GET /api/catalogs/empty": { status: 200, body: "" },
      "GET /api/catalogs/null": { status: 200, body: "null" },
      "GET /api/catalogs/list": json(200, []),
      "GET /api/catalogs/listed": json(200, [{ id: "listed" }]),
    };

    const summary = await seed(EACH, {
      catalogs: [
        { id: "stored" },
        { id: "missing" },
        { id: "empty" },
        { id: "null" },
        { id: "list" },
        { id: "listed" },
      ],
    });

    expect(received.map((entry) => entry.request)).toEqual([
      "GET /api/catalogs/stored",
      "GET /api/catalogs/missing",
      "POST /api/catalogs",
      "GET /api/catalogs/empty",
      "POST /api/catalogs",
      "GET /api/catalogs/null",
      "POST /api/catalogs",
      "GET /api/catalogs/list",
      "POST /api/catalogs",
      "GET /api/catalogs/listed",
    ]);
    expect(summary).toEqual({ collections: ["catalogs"], skipped: [], sent: 4, existing: 2 });
  });

  test("leaves out the stored records of a collection sent in one request", async () => {
    replies = { "GET /api/inventories/product-1": json(200, { productId: "product-1" }) };

    const summary = await seed(ALL, { inventories: [{ productId: "product-1" }, { productId: "product-2" }] });

    expect(received).toEqual([
      { request: "GET /api/inventories/product-1" },
      { request: "GET /api/inventories/product-2" },
      { request: "PUT /api/inventories", body: [{ productId: "product-2" }] },
    ]);
    expect(summary).toEqual({ collections: ["inventories"], skipped: [], sent: 1, existing: 1 });
  });

  test("sends no request when every record of a collection sent in one request is stored", async () => {
    replies = { "GET /api/inventories/product-1": json(200, { productId: "product-1" }) };

    const summary = await seed(ALL, { inventories: [{ productId: "product-1" }] });

    expect(received).toEqual([{ request: "GET /api/inventories/product-1" }]);
    expect(summary).toEqual({ collections: ["inventories"], skipped: [], sent: 0, existing: 1 });
  });

  test("fails when the find path returns an error other than 404", async () => {
    replies = { "GET /api/catalogs/catalog-1": json(500, { message: "failure" }) };

    const error = await seedError(EACH, { catalogs: [{ id: "catalog-1" }] });

    expect(error.message).toMatch(
      /^catalogs record "catalog-1": GET http:\/\/[\d.:]+\/api\/catalogs\/catalog-1 → 500 /,
    );
    expect(error.cause).toBeInstanceOf(HttpError);
  });
});

test.describe("seedDataset If-Match", () => {
  const MANIFEST = {
    settings: {
      module: MODULE,
      method: "PUT",
      path: `/api/settings/${recordPlaceholder("id")}`,
      ifMatchPath: `/api/settings/${recordPlaceholder("id")}`,
      send: "each",
    },
  } as const;

  test("sends the ETag of the if-match path as If-Match", async () => {
    replies = { "GET /api/settings/setting-1": json(200, {}, { etag: '"v7"' }) };

    await seed(MANIFEST, { settings: [{ id: "setting-1" }] });

    expect(received).toEqual([
      { request: "GET /api/settings/setting-1" },
      { request: "PUT /api/settings/setting-1", ifMatch: '"v7"', body: { id: "setting-1" } },
    ]);
  });

  test("sends no If-Match when the if-match path has no ETag", async () => {
    replies = { "GET /api/settings/setting-1": json(200, {}) };

    await seed(MANIFEST, { settings: [{ id: "setting-1" }] });

    expect(received[1]).toEqual({ request: "PUT /api/settings/setting-1", body: { id: "setting-1" } });
  });

  test("sends no If-Match when the if-match path is not found", async () => {
    await seed(MANIFEST, { settings: [{ id: "setting-1" }] });

    expect(received).toEqual([
      { request: "GET /api/settings/setting-1" },
      { request: "PUT /api/settings/setting-1", body: { id: "setting-1" } },
    ]);
  });

  test("sends If-Match for a collection sent in one request", async () => {
    const manifest = {
      settings: {
        module: MODULE,
        method: "PUT",
        path: `/api/stores/${envPlaceholder("STORE")}/settings`,
        ifMatchPath: `/api/stores/${envPlaceholder("STORE")}`,
        send: "all",
      },
    } as const;
    replies = { "GET /api/stores/store-1": json(200, {}, { etag: '"v2"' }) };

    await seed(manifest, { settings: [{ name: "a" }, { name: "b" }] }, { placeholders: { STORE: "store-1" } });

    expect(received).toEqual([
      { request: "GET /api/stores/store-1" },
      { request: "PUT /api/stores/store-1/settings", ifMatch: '"v2"', body: [{ name: "a" }, { name: "b" }] },
    ]);
  });
});

test.describe("seedDataset stored identifiers", () => {
  const MANIFEST = {
    shippingMethods: {
      module: MODULE,
      method: "PUT",
      path: "/api/shipping",
      send: "each",
      key: "code",
      storedIdFrom: {
        searchPath: "/api/shipping/search",
        criteria: { storeId: envPlaceholder("STORE"), codes: [recordPlaceholder("code")] },
        match: "code",
      },
    },
  } as const;

  test("sends a record with the identifier of its stored copy", async () => {
    replies = {
      "POST /api/shipping/search": json(200, {
        results: [
          { id: "other-id", code: "Other" },
          { id: "stored-id", code: "Fixed" },
        ],
      }),
    };

    await seed(
      MANIFEST,
      { shippingMethods: [{ code: "Fixed", name: "Fixed rate" }] },
      {
        placeholders: { STORE: 'store "B2B"' },
      },
    );

    expect(received).toEqual([
      { request: "POST /api/shipping/search", body: { storeId: 'store "B2B"', codes: ["Fixed"] } },
      { request: "PUT /api/shipping", body: { id: "stored-id", code: "Fixed", name: "Fixed rate" } },
    ]);
  });

  test("sends a record as it is when no stored copy matches", async () => {
    replies = { "POST /api/shipping/search": json(200, { results: [{ id: "other-id", code: "Other" }] }) };

    await seed(MANIFEST, { shippingMethods: [{ code: "Fixed" }] }, { placeholders: { STORE: "store-1" } });

    expect(received[1]).toEqual({ request: "PUT /api/shipping", body: { code: "Fixed" } });
  });

  test("orders parents by the dataset identifiers before it applies the stored ones", async () => {
    const manifest = {
      categories: {
        module: MODULE,
        method: "PUT",
        path: "/api/categories",
        send: "each",
        parentField: "parentId",
        storedIdFrom: { searchPath: "/api/categories/search", criteria: {}, match: "code" },
      },
    } as const;
    replies = {
      "POST /api/categories/search": json(200, {
        results: [
          { id: "stored-root", code: "root" },
          { id: "stored-child", code: "child" },
        ],
      }),
    };

    await seed(manifest, {
      categories: [
        { id: "child", code: "child", parentId: "root" },
        { id: "root", code: "root" },
      ],
    });

    expect(received.filter((entry) => entry.request === "PUT /api/categories").map((entry) => entry.body)).toEqual([
      { id: "stored-root", code: "root" },
      { id: "stored-child", code: "child", parentId: "root" },
    ]);
  });
});

test.describe("seedDataset failures", () => {
  const MANIFEST = {
    users: { module: MODULE, method: "POST", path: "/api/users", send: "each", key: ["storeId", "userName"] },
  } as const;

  test("fails for a success status with succeeded false in the body", async () => {
    replies = { "POST /api/users": json(200, { succeeded: false, errors: ["Password too short"] }) };

    const error = await seedError(MANIFEST, { users: [{ storeId: "store-1", userName: "buyer" }] });

    expect(error.message).toMatch(
      /^users record "store-1 \+ buyer": POST http:\/\/[\d.:]+\/api\/users → 200 OK: the platform refused/,
    );
    expect(error.message).toContain("Password too short");
    expect(error.cause).toBeInstanceOf(HttpError);
  });

  test("accepts a success status with succeeded true", async () => {
    replies = { "POST /api/users": json(200, { succeeded: true }) };

    const summary = await seed(MANIFEST, { users: [{ userName: "buyer" }] });

    expect(summary.sent).toBe(1);
  });

  test("names a record without one of its key fields by its position", async () => {
    replies = { "POST /api/users": json(400, {}) };

    const error = await seedError(MANIFEST, { users: [{ userName: "buyer" }] });

    expect(error.message).toMatch(/^users record #1: POST /);
  });

  test("names the record by its position without an identifier or a key, and masks secrets", async () => {
    const password = Secret.of("seed-password-12345");
    const manifest = { items: { module: MODULE, method: "POST", path: "/api/items", send: "each" } } as const;
    replies = { "POST /api/items": json(400, { message: `rejected ${password.reveal()}` }) };

    const error = await seedError(manifest, { items: [{ password: password.reveal() }] });

    expect(error.message).toMatch(/^items record #1: POST http:\/\/[\d.:]+\/api\/items → 400 /);
    expect(error.message).toContain(MASKED);
    expect(error.message).not.toContain(password.reveal());
  });

  test("names a record by its position in file order", async () => {
    const manifest = {
      items: {
        module: MODULE,
        method: "PUT",
        path: `/api/items/${recordPlaceholder("name")}`,
        findPath: `/api/items/${recordPlaceholder("name")}`,
        send: "each",
      },
    } as const;
    replies = { "GET /api/items/a": json(200, { name: "a" }), "PUT /api/items/b": json(400, {}) };

    const error = await seedError(manifest, { items: [{ name: "a" }, { name: "b" }] });

    expect(error.message).toMatch(/^items record #2: PUT /);
  });

  test("names the collection and the record of a placeholder without a value", async () => {
    const manifest = {
      inventories: {
        module: MODULE,
        method: "PUT",
        path: `/api/inventories/${recordPlaceholder("productId")}`,
        send: "each",
        key: "sku",
      },
    } as const;

    const error = await seedError(manifest, { inventories: [{ sku: "laptop" }] });

    expect(error.message).toBe(`inventories record "laptop": ${recordPlaceholder("productId")} has no value`);
    expect(received).toEqual([]);
  });

  const INVALID = [
    {
      title: "a parent field",
      spec: { module: MODULE, method: "PUT", path: "/api/prices", send: "all", parentField: "parentId" },
      message: "The collection prices is sent in one request, so it cannot have a parentField",
    },
    {
      title: "a record placeholder in its path",
      spec: { module: MODULE, method: "PUT", path: `/api/prices/${recordPlaceholder("id")}`, send: "all" },
      message: "The collection prices is sent in one request, so /api/prices/",
    },
    {
      title: "a record placeholder in its if-match path",
      spec: {
        module: MODULE,
        method: "PUT",
        path: "/api/prices",
        ifMatchPath: `/api/prices/${recordPlaceholder("id")}`,
        send: "all",
      },
      message: "cannot have record placeholders",
    },
  ] as const;

  for (const { title, spec, message } of INVALID) {
    test(`rejects a collection sent in one request with ${title} before any request`, async () => {
      const manifest = {
        catalogs: { module: MODULE, method: "POST", path: "/api/catalogs", send: "each" },
        prices: spec,
      } as const;

      await expect(seed(manifest, { catalogs: [{ id: "catalog-1" }], prices: [{ id: "price-1" }] })).rejects.toThrow(
        message,
      );
      expect(received).toEqual([]);
    });
  }

  test("names the collection of a failed finisher and keeps the cause", async () => {
    const manifest = { pages: { module: MODULE, method: "POST", path: "/api/pages", send: "each" } } as const;
    const cause = new Error("publishing failed");

    const error = await seed(
      manifest,
      { pages: [{ id: "page-1" }] },
      { finishers: { pages: () => Promise.reject(cause) } },
    )
      .then(() => undefined)
      .catch((thrown: unknown) => thrown as Error);

    expect(error?.message).toBe("pages finisher: publishing failed");
    expect(error?.cause).toBe(cause);
  });
});

test.describe("seedDataset run", () => {
  const MANIFEST = {
    catalogs: { module: MODULE, method: "POST", path: "/api/catalogs", send: "each" },
    pages: { module: { id: "VirtoCommerce.PageBuilderModule" }, method: "POST", path: "/api/pages", send: "each" },
    prices: {
      module: { id: "VirtoCommerce.Pricing", minVersion: "3.1020.0" },
      method: "PUT",
      path: "/api/prices",
      send: "all",
    },
    products: { module: MODULE, method: "POST", path: "/api/products", send: "each" },
  } as const;
  const DATASET = {
    catalogs: new Collection("catalogs", [{ id: "catalog-1" }]),
    pages: new Collection("pages", [{ id: "page-1" }]),
    prices: new Collection("prices", [{ price: 1 }]),
    products: new Collection("products", [{ id: "product-1" }]),
  };
  const MANIFEST_FAILURE = [
    { kind: "failed", step: "manifest", seconds: expect.any(Number) },
    { kind: "finished", seeded: 0, skipped: 0, failed: 1, sent: 0, existing: 0, seconds: expect.any(Number) },
  ];
  const INSTALLED_WITH_PRICING = new InstalledModules({
    "VirtoCommerce.Catalog": "3.1051.0",
    "VirtoCommerce.Pricing": "3.1010.0",
  });

  test("skips the collections whose module does not qualify, and reports them", async () => {
    const events: SeedEvent[] = [];

    const summary = await seedDataset({
      http: httpClient,
      manifest: MANIFEST,
      dataset: DATASET,
      installed: INSTALLED_WITH_PRICING,
      onEvent: (event) => events.push(event),
    });

    expect(received.map((entry) => entry.request)).toEqual(["POST /api/catalogs", "POST /api/products"]);
    expect(summary).toEqual({
      collections: ["catalogs", "products"],
      skipped: [
        { name: "pages", reason: "VirtoCommerce.PageBuilderModule is not installed" },
        { name: "prices", reason: "VirtoCommerce.Pricing 3.1010.0 is older than 3.1020.0" },
      ],
      sent: 2,
      existing: 0,
    });
    expect(events.slice(0, 3)).toEqual([
      { kind: "skipped", name: "pages", reason: "VirtoCommerce.PageBuilderModule is not installed" },
      { kind: "skipped", name: "prices", reason: "VirtoCommerce.Pricing 3.1010.0 is older than 3.1020.0" },
      { kind: "started", collections: ["catalogs", "products"] },
    ]);
    expect(events.at(-1)).toEqual({
      kind: "finished",
      seeded: 2,
      skipped: 2,
      failed: 0,
      sent: 2,
      existing: 0,
      seconds: expect.any(Number),
    });
  });

  test("seeds only the selected collections, in seed order", async () => {
    const summary = await seedDataset({
      http: httpClient,
      manifest: MANIFEST,
      dataset: DATASET,
      installed: INSTALLED_WITH_PRICING,
      only: ["products", "prices", "catalogs"],
    });

    expect(received.map((entry) => entry.request)).toEqual(["POST /api/catalogs", "POST /api/products"]);
    expect(summary.collections).toEqual(["catalogs", "products"]);
    expect(summary.skipped.map((skipped) => skipped.name)).toEqual(["prices"]);
  });

  test("runs the finisher of a collection right after it, and reports every step", async () => {
    const steps: string[] = [];
    const events: SeedEvent[] = [];

    const summary = await seedDataset({
      http: httpClient,
      manifest: MANIFEST,
      dataset: DATASET,
      installed: INSTALLED,
      only: ["catalogs", "pages"],
      finishers: {
        catalogs: async () => {
          steps.push(`finisher after ${received.length} requests`);
        },
        pages: async () => {
          steps.push("pages finisher");
        },
      },
      onEvent: (event) => events.push(event),
    });

    expect(summary.sent).toBe(1);
    expect(steps).toEqual(["finisher after 1 requests"]);
    expect(events).toEqual([
      { kind: "skipped", name: "pages", reason: "VirtoCommerce.PageBuilderModule is not installed" },
      { kind: "started", collections: ["catalogs"] },
      {
        kind: "seeded",
        name: "catalogs",
        counts: { records: 1, sent: 1, existing: 0 },
        seconds: expect.any(Number),
      },
      { kind: "finished", seeded: 1, skipped: 1, failed: 0, sent: 1, existing: 0, seconds: expect.any(Number) },
    ]);
  });

  test("reports a collection without records as skipped", async () => {
    const events: SeedEvent[] = [];

    await seedDataset({
      http: httpClient,
      manifest: MANIFEST,
      dataset: { ...DATASET, catalogs: new Collection("catalogs", []) },
      installed: INSTALLED,
      only: ["catalogs"],
      onEvent: (event) => events.push(event),
    });

    expect(events).toContainEqual({ kind: "skipped", name: "catalogs", reason: "no records" });
    expect(events.at(-1)).toMatchObject({ kind: "finished", seeded: 0, skipped: 1 });
  });

  test("reports a failed collection with its record before the error is thrown, and finishes the run", async () => {
    const events: SeedEvent[] = [];
    replies = { "POST /api/products": json(500, {}) };

    await expect(
      seedDataset({
        http: httpClient,
        manifest: MANIFEST,
        dataset: DATASET,
        installed: INSTALLED,
        only: ["catalogs", "products"],
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow('products record "product-1": POST');
    expect(events.slice(-2)).toEqual([
      {
        kind: "failed",
        step: "records",
        name: "products",
        subject: 'record "product-1"',
        counts: { records: 1, sent: 0, existing: 0 },
        seconds: expect.any(Number),
      },
      { kind: "finished", seeded: 1, skipped: 0, failed: 1, sent: 1, existing: 0, seconds: expect.any(Number) },
    ]);
  });

  test("reports the counts that a failed collection reached", async () => {
    const events: SeedEvent[] = [];
    const manifest = {
      products: {
        module: MODULE,
        method: "POST",
        path: `/api/products/${recordPlaceholder("id")}`,
        findPath: `/api/products/${recordPlaceholder("id")}`,
        send: "each",
      },
    } as const;
    replies = {
      "GET /api/products/product-1": json(200, { id: "product-1" }),
      "POST /api/products/product-3": json(500, {}),
    };

    await expect(
      seed(
        manifest,
        { products: [{ id: "product-1" }, { id: "product-2" }, { id: "product-3" }] },
        { onEvent: (event) => events.push(event) },
      ),
    ).rejects.toThrow('products record "product-3"');
    expect(events.slice(-2)).toEqual([
      {
        kind: "failed",
        step: "records",
        name: "products",
        subject: 'record "product-3"',
        counts: { records: 3, sent: 1, existing: 1 },
        seconds: expect.any(Number),
      },
      { kind: "finished", seeded: 0, skipped: 0, failed: 1, sent: 1, existing: 1, seconds: expect.any(Number) },
    ]);
  });

  test("reports the request of a failed collection sent in one request", async () => {
    const events: SeedEvent[] = [];
    replies = { "PUT /api/prices": json(500, {}) };

    await expect(
      seedDataset({
        http: httpClient,
        manifest: MANIFEST,
        dataset: { ...DATASET, prices: new Collection("prices", [{ price: 1 }, { price: 2 }]) },
        installed: new InstalledModules({ "VirtoCommerce.Pricing": "3.1020.0" }),
        only: ["prices"],
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow("prices 2 records");
    expect(events.at(-2)).toMatchObject({ kind: "failed", step: "records", name: "prices", subject: "2 records" });
  });

  test("reports a failed finisher", async () => {
    const events: SeedEvent[] = [];

    await expect(
      seedDataset({
        http: httpClient,
        manifest: MANIFEST,
        dataset: DATASET,
        installed: INSTALLED,
        only: ["catalogs"],
        finishers: { catalogs: () => Promise.reject(new Error("publishing failed")) },
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow("catalogs finisher: publishing failed");
    expect(events.slice(-3)).toEqual([
      expect.objectContaining({ kind: "seeded", name: "catalogs" }),
      {
        kind: "failed",
        step: "finisher",
        name: "catalogs",
        counts: { records: 1, sent: 1, existing: 0 },
        seconds: expect.any(Number),
      },
      { kind: "finished", seeded: 1, skipped: 0, failed: 1, sent: 1, existing: 0, seconds: expect.any(Number) },
    ]);
  });

  test("reports an invalid manifest entry before any request", async () => {
    const events: SeedEvent[] = [];
    const manifest = {
      prices: { module: MODULE, method: "PUT", path: "/api/prices", send: "all", parentField: "parentId" },
    } as const;

    await expect(
      seedDataset({
        http: httpClient,
        manifest,
        dataset: { prices: new Collection("prices", [{ id: "price-1" }]) },
        installed: INSTALLED,
        onEvent: (event) => events.push(event),
      }),
    ).rejects.toThrow("The collection prices is sent in one request");
    expect(events).toEqual(MANIFEST_FAILURE);
    expect(received).toEqual([]);
  });

  test("names the collection of a module version that cannot be compared, and reports it", async () => {
    const events: SeedEvent[] = [];

    const error = await seedDataset({
      http: httpClient,
      manifest: MANIFEST,
      dataset: DATASET,
      installed: new InstalledModules({ "VirtoCommerce.Catalog": "3.1051.0", "VirtoCommerce.Pricing": "1.0.0.0" }),
      onEvent: (event) => events.push(event),
    })
      .then(() => undefined)
      .catch((thrown: unknown) => thrown as Error);

    expect(error?.message).toMatch(/^prices: VirtoCommerce\.Pricing: "1\.0\.0\.0" is not a module version/);
    expect(error?.cause).toBeInstanceOf(Error);
    expect(events).toEqual(MANIFEST_FAILURE);
    expect(received).toEqual([]);
  });

  test("reports the collections without records among the skipped ones, in seed order", async () => {
    const events: SeedEvent[] = [];

    const summary = await seedDataset({
      http: httpClient,
      manifest: MANIFEST,
      dataset: { ...DATASET, catalogs: new Collection("catalogs", []) },
      installed: INSTALLED_WITH_PRICING,
      onEvent: (event) => events.push(event),
    });

    const skipped = [
      { name: "catalogs", reason: "no records" },
      { name: "pages", reason: "VirtoCommerce.PageBuilderModule is not installed" },
      { name: "prices", reason: "VirtoCommerce.Pricing 3.1010.0 is older than 3.1020.0" },
    ];
    expect(summary.skipped).toEqual(skipped);
    expect(events.slice(0, 4)).toEqual([
      ...skipped.map((entry) => ({ kind: "skipped", ...entry })),
      { kind: "started", collections: ["products"] },
    ]);
    expect(events.at(-1)).toMatchObject({ kind: "finished", seeded: 1, skipped: 3 });
  });

  test("stops the run when the event listener fails", async () => {
    const error = await seedDataset({
      http: httpClient,
      manifest: MANIFEST,
      dataset: DATASET,
      installed: INSTALLED,
      only: ["catalogs", "products"],
      onEvent: (event) => {
        if (event.kind === "seeded") {
          throw new Error("formatting failed");
        }
      },
    })
      .then(() => undefined)
      .catch((thrown: unknown) => thrown as Error);

    expect(error?.message).toBe("The seed event listener failed on a seeded event: formatting failed");
    expect(received.map((entry) => entry.request)).toEqual(["POST /api/catalogs"]);
  });

  test("keeps the failure of the run when the event listener fails to report it", async () => {
    replies = { "POST /api/products": json(500, {}) };

    const error = await seedDataset({
      http: httpClient,
      manifest: MANIFEST,
      dataset: DATASET,
      installed: INSTALLED,
      only: ["products"],
      onEvent: (event) => {
        if (event.kind === "failed") {
          throw new Error("formatting failed");
        }
      },
    })
      .then(() => undefined)
      .catch((thrown: unknown) => thrown as AggregateError);

    expect(error).toBeInstanceOf(AggregateError);
    expect(error?.message).toMatch(
      /^products record "product-1": POST .*; The seed event listener failed on a failed event/s,
    );
    expect(error?.errors.map((entry: Error) => entry.message)).toEqual([
      expect.stringMatching(/^products record "product-1": POST /),
      "The seed event listener failed on a failed event: formatting failed",
    ]);
  });

  test("counts a failure of the event listener in the finished event", async () => {
    const events: SeedEvent[] = [];

    await expect(
      seedDataset({
        http: httpClient,
        manifest: MANIFEST,
        dataset: DATASET,
        installed: INSTALLED,
        only: ["catalogs"],
        onEvent: (event) => {
          events.push(event);
          if (event.kind === "seeded") {
            throw new Error("formatting failed");
          }
        },
      }),
    ).rejects.toThrow("The seed event listener failed on a seeded event");
    expect(events.at(-1)).toMatchObject({ kind: "finished", seeded: 1, failed: 1 });
  });

  test("masks secrets in the message of a failure that the event listener fails to report", async () => {
    const password = Secret.of("listener-password-12345");
    replies = { "POST /api/products": json(500, {}) };

    const error = await seedDataset({
      http: httpClient,
      manifest: MANIFEST,
      dataset: DATASET,
      installed: INSTALLED,
      only: ["products"],
      onEvent: (event) => {
        if (event.kind === "failed") {
          throw new Error(`could not log with ${password.reveal()}`);
        }
      },
    })
      .then(() => undefined)
      .catch((thrown: unknown) => thrown as AggregateError);

    expect(error).toBeInstanceOf(AggregateError);
    expect(error?.message).toContain(`could not log with ${MASKED}`);
    expect(error?.message).not.toContain(password.reveal());
  });

  test("reports a run without collections", async () => {
    const events: SeedEvent[] = [];

    await seedDataset({
      http: httpClient,
      manifest: MANIFEST,
      dataset: DATASET,
      installed: new InstalledModules({}),
      onEvent: (event) => events.push(event),
    });

    expect(events.slice(-2)).toEqual([
      { kind: "started", collections: [] },
      { kind: "finished", seeded: 0, skipped: 4, failed: 0, sent: 0, existing: 0, seconds: expect.any(Number) },
    ]);
    expect(received).toEqual([]);
  });
});
