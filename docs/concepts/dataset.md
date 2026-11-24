# Dataset

A test suite keeps the data its tests rely on, such as catalogs, products, users and pages, as JSON files, and seeds
them into the platform before the tests run. The framework loads the files and sends them; the test suite owns the
data, the manifest that describes it, and the record types.

## Data layout

The data directory holds one directory for each collection, named after the collection in kebab case: the records of
`productInventories` are in `product-inventories/`. Each `.json` file under it,
in any subdirectory, is one record. The files are read in the order of their paths, with `/` as the separator, so the
order is the same on every operating system.

```text
data/
  catalogs/
    catalog-b2b.json
  categories/
    b2b/
      category-laptops.json
  product-inventories/
    laptop-main-warehouse.json
```

A collection without a directory is empty, so a test suite can seed a subset of its manifest.

## The manifest

The manifest lists the collections in seed order, and describes how each one is sent. A collection that references
another, such as a category that references its catalog, comes after it.

| Field          | Meaning                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `module`       | The module requirement of the collection. A collection whose module does not qualify is skipped   |
| `method`       | The method of the seed request                                                                    |
| `path`         | The path of the seed request                                                                      |
| `send`         | `each` sends one request for each record; `all` sends one request with every record               |
| `key`          | The field, or the fields, that name a record without an `id` in logs and errors                   |
| `findPath`     | A path that finds a stored record. A stored record is left as it is; see below                    |
| `ifMatchPath`  | The path whose `ETag` is sent as `If-Match`, for endpoints that need the current version          |
| `storedIdFrom` | A search that finds the stored copy of a record whose identifier the platform assigns             |
| `parentField`  | The field that references a parent in the same collection. Parents are sent before their children |

A `findPath` that answers with a 404 status, an empty body, `null` or an empty array means that the record is not
stored, so it also works with list endpoints. Without `findPath`, every record is sent on every run, and the endpoint
replaces the stored copy. With `storedIdFrom`,
the seeder searches for the stored copy first, by the `match` field, and sends the record with the stored identifier,
so the platform updates that copy instead of adding another. When several stored records match, the first one is used.
When the `ifMatchPath` is not found or has no `ETag`, the request is sent without `If-Match`.

A collection sent in one request (`all`) cannot have a `parentField`, and its `path` and `ifMatchPath` cannot have
record placeholders. The seeder checks the collections in scope before it sends the first request.

## Placeholders

Paths and data files can contain placeholders:

- `${ENV:key}` is filled from the `placeholders` that the test suite passes, such as a store identifier or a password.
  A `Secret` value is revealed where it is filled in, and masked in errors.
- `${RECORD:field}` is filled from the record, in `findPath` and `storedIdFrom` of any collection, and in `path` and
  `ifMatchPath` of a collection sent one record at a time.

Values in paths are URL-encoded, and values in data files are escaped as JSON string content. A placeholder without a
value is an error.

In TypeScript, `envPlaceholder("STORE_ID")` and `recordPlaceholder("code")` return the placeholders, and compose into
paths, such as `` `/api/inventory/products/${recordPlaceholder("productId")}` ``. They keep the placeholder syntax in
one place, and linters do not report them, as they report `${` in a plain string.

## Loading

`loadDataset` reads every collection of the manifest and returns one `Collection` for each. The records are frozen;
copy a record to build a request body from it. `get` returns a record by its `id`, and fails for an unknown or a
duplicated identifier; `all` and `filter` return records in file order.

The second type parameter gives the record type of collections by name, such as types generated from the platform.
Collections that it does not name hold plain JSON objects. The types are not checked at run time.

## Seeding

`seedDataset` takes the installed modules, read with `InstalledModules.read`, and optionally `only`, the collections
to seed, which `parseCollectionNames` reads from a list such as `products, prices`. It seeds every collection, or the
ones in `only`, in seed order, and skips those whose module does not qualify and those without records. It returns the
collections it seeded and skipped, with the reason for each skip, how many records it sent, and how many were already
stored.

The first failed request stops the run. A success status with `succeeded: false` in the body is also a failure,
because some endpoints refuse a record that way. The error names the collection and the record, has secrets masked, and
keeps the original error as its cause. A finisher, given by collection, runs right after its collection, for work such
as publishing the pages just seeded.

`onEvent` receives each step of the run as a `SeedEvent`, which carries facts rather than text:

| Event      | When                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `started`  | The manifest is checked; it lists the collections to seed                                         |
| `skipped`  | A collection's module does not qualify, or the collection has no records                          |
| `seeded`   | A collection is seeded; it has the number of records, how many were sent and how many were stored |
| `failed`   | The manifest is invalid, a record or request of a collection fails, or a finisher fails           |
| `finished` | The run ends, also after a failure; it counts the collections seeded, skipped and failed          |

A `failed` event comes just before the error is thrown. For a collection, it has the counts reached so far and the
record or request that failed. The manifest is invalid when an entry breaks the rules above, or when the installed
version of a module cannot be compared with its range; the error names the collection. The test suite decides how the
events look, such as coloured counts on the console and plain text in a log it attaches to the report.

An error thrown by `onEvent` stops the run, and names the event. When the listener fails while it reports a failure,
the run throws an `AggregateError` with the failure of the run first, so a bug in the listener does not hide why the
seed failed.

<!-- example: ../examples/dataset.ts -->
```ts
import type { Manifest, SeedEvent, SeedSummary } from "@virtocommerce/test-automation-framework/dataset";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { fileURLToPath } from "node:url";

import {
  envPlaceholder,
  loadDataset,
  parseCollectionNames,
  recordPlaceholder,
  seedDataset,
} from "@virtocommerce/test-automation-framework/dataset";
import { InstalledModules } from "@virtocommerce/test-automation-framework/modules";

const CATALOG = { id: "VirtoCommerce.Catalog", minVersion: "3.1051.0" };
const SHIPPING = { id: "VirtoCommerce.Shipping", minVersion: "3.1010.0" };

export const MANIFEST = {
  catalogs: { module: CATALOG, method: "POST", path: "/api/catalog/catalogs", send: "each" },
  categories: {
    module: CATALOG,
    method: "POST",
    path: "/api/catalog/categories",
    send: "each",
    key: "code",
    parentField: "parentId",
  },
  shippingMethods: {
    module: SHIPPING,
    method: "PUT",
    path: "/api/shipping",
    send: "each",
    key: "code",
    storedIdFrom: {
      searchPath: "/api/shipping/search",
      criteria: { storeId: envPlaceholder("STORE_ID"), codes: [recordPlaceholder("code")] },
      match: "code",
    },
  },
} as const satisfies Manifest;

type Catalog = { readonly id: string; readonly name: string };

const PLACEHOLDERS = { STORE_ID: "B2B-store" };

export const dataset = loadDataset<typeof MANIFEST, { readonly catalogs: Catalog }>({
  manifest: MANIFEST,
  dataDir: fileURLToPath(new URL("data", import.meta.url)),
  placeholders: PLACEHOLDERS,
});

export function catalogName(id: string): string {
  return dataset.catalogs.get(id).name;
}

export async function seed(
  admin: HttpClient,
  only: string | undefined,
  onEvent: (event: SeedEvent) => void,
): Promise<SeedSummary<typeof MANIFEST>> {
  return seedDataset({
    http: admin,
    manifest: MANIFEST,
    dataset,
    installed: await InstalledModules.read(admin),
    only: parseCollectionNames(MANIFEST, only),
    placeholders: PLACEHOLDERS,
    onEvent,
  });
}
```
