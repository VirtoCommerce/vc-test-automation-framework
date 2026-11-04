---
name: create-rest-client
description: "Add platform REST client methods, resources, clients and named types — paths checked against swagger, record shapes over generated models with record/optionalRecord/records/results, wired into RestApi as api.rest.<module>"
argument-hint: "<platform-module> <endpoint-or-method>"
---

## REST Client Layer

Specs never build REST requests. They call `api.rest.<module>.<resource>.<method>(...)`. Each client in
`api/rest/clients/` returns named types from `api/rest/types/`, built on the generated Swagger models. The `api`
layer imports only `core`.

## File Locations

- Clients: `api/rest/clients/<module>-client.ts`, e.g. `PricingClient` (reference: `pricing-client.ts`)
- Registry: `api/rest/rest-api.ts` (`RestApi`, exposed as `ApiSession#rest`)
- Named types: `api/rest/types/<module>.ts` (reference: `types/pricing.ts`)
- Generated models, never edited: `api/rest/generated/` (`npm run codegen:rest` against the running platform)
- HTTP: `api/http/http-client.ts` (`get`, `post`, `put`, `patch`, `delete`, `send`; options `query`, `json`,
  `form`, `multipart`, `headers`), `api/http/http-response.ts`
- Background jobs: `findPushNotification` in `api/rest/clients/push-notifications.ts`

## Step 1: Verify the Endpoint

Find the path, method, parameters and models in the Swagger (`api/rest/generated/rest-api.ts`) before writing
code. Paths guessed from names are often wrong (role creation is PUT; API keys live under
`/api/platform/security/users/apikeys`). Check whether the client already has the method, or a sibling resource
of the same shape.

## Step 2: Named Types

```ts
import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type PricelistData = Rest.VirtoCommercePricingModuleCoreModelPricelist;

export const PRICELIST = shape<PricelistData>()("Pricelist", ["id", "name", "currency"]);
export type Pricelist = Shaped<typeof PRICELIST>;

export type PricelistQuery = {
  readonly keyword?: string;
  readonly skip?: number;
  readonly take?: number;
};
```

- Name generated models with one line each: `export type XData = Rest.<GeneratedName>;` (`XSearchCriteria`, …).
- The shape `X` names the model for errors and lists the fields tests rely on; the type `X` makes them required
  and read-only. One shape per data type; a field list shared by two types becomes two shapes.
- A resource generic over its data type builds its own shape in the constructor:
  `shape<Data>()(label, MEMBER.fields)` (see `MemberResource`).
- Query types for GET searches are hand-written, all fields `readonly` and optional.
- Export only what clients, builders or specs use.

## Step 3: Client

```ts
const PRICELISTS_PATH = "/api/pricing/pricelists";

class PricelistsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async get(id: string): Promise<Pricelist> {
    return requireFields(await this.find(id), PRICELIST.fields, `Pricelist "${id}"`);
  }

  async find(id: string): Promise<Pricelist | undefined> {
    return (await this.#httpClient.get(`${PRICELISTS_PATH}/${encodeURIComponent(id)}`)).optionalRecord(PRICELIST);
  }

  async create(pricelist: PricelistData): Promise<Pricelist> {
    return (await this.#httpClient.post(PRICELISTS_PATH, { json: pricelist })).record(PRICELIST);
  }

  async update(pricelist: PricelistData): Promise<void> {
    (await this.#httpClient.put(PRICELISTS_PATH, { json: pricelist })).expectOk();
  }

  async search(query: PricelistQuery): Promise<Pricelist[]> {
    return (await this.#httpClient.get(PRICELISTS_PATH, { query })).results(PRICELIST);
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(PRICELISTS_PATH, { query: { ids } })).expectOk();
  }
}

export class PricingClient {
  readonly pricelists: PricelistsResource;

  constructor(httpClient: HttpClient) {
    this.pricelists = new PricelistsResource(httpClient);
  }
}
```

**Response handling:**
- `json<T>()` requires 2xx and parses; `expectOk()` for calls whose body does not matter. A non-2xx throws
  `HttpError` with method, URL, status and the start of the body.
- `optionalJson<T>()` for "not found": an empty or `null` body gives `undefined`. Pass `{ allow404: true }` only
  for endpoints that answer a missing record with 404.
- Check responses against the shape: `record(X)` for one record, `optionalRecord(X)` for a lookup (`undefined`
  when nothing is found; `{ allow404: true }` as for `optionalJson`), `records(X)` for a JSON array, `results(X)`
  for a search result's `results`. Errors name the shape and the request, such as
  `Pricelist from POST /api/pricing/pricelists has no id`.
- For a value computed first (an item picked from a list, a nested field), use
  `requireFields(value, X.fields, label)` with a label that says where it came from. A list the platform sends
  as `null` for "none": `requireFieldsOfEach(list ?? [], X.fields, …)` with a short JSDoc saying so.
- `parse(schema)` with a zod schema when the whole shape must be validated (see `HealthClient`).
- Path segments go through `encodeURIComponent`; query parameters through `query` (arrays repeat the key).

**Shape:**
- `get()` throws when missing; `find()` returns `undefined`.
- Methods return named types, or `void`. Security endpoints return `SecurityResult`; callers check `succeeded`.
- A module with several resources: one resource class each, grouped on the client (`pricing.pricelists`,
  `pricing.prices`, `pricing.assignments`). Resources of the same shape share one generic class.
- A bulk delete by filter guards against an empty filter, because an unfiltered call deletes everything
  (`AssignmentsResource#deleteMatching`), and gets a unit test in `tests/unit/api/rest/clients/`.
- An endpoint that starts a background job returns a notification with a required `id`; add a
  `find…(notificationId)` method on `findPushNotification`. Tests poll it until `finished`, then check `errorCount`.
- Store-bound clients take the store id in the constructor (`ContentClient`).

## Step 4: Register It

A new client gets a `readonly` field in `RestApi` (`api/rest/rest-api.ts`), kept in alphabetical order. Specs
then use `api.rest.<module>`; `arrange` uses `admin.rest.<module>`.

Setup that several specs share goes into `dataset/arrange/<domain>.ts` on top of the client, with a builder in
`dataset/builders/` (see `/plan-implementation`).

## Rules

1. Paths and methods verified against Swagger; path constants at the top of the file.
2. State in `readonly #httpClient`; methods `async` with explicit return types.
3. Results checked against a shape (`record`, `optionalRecord`, `records`, `results`, or `requireFields` with
   `X.fields`); no `?? []` that hides a missing response.
4. Named types in `api/rest/types/`; never edit `api/rest/generated/`.
5. No test logic, assertions or cleanup in clients.
6. JSDoc only for what the signature cannot say (side effects, guards, which method to use when); no comments.
7. Remove methods nothing calls.

## Verify

```shell
npm run typecheck && npm run check
npm run test:unit
```
