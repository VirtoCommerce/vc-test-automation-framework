---
name: create-rest-client
description: "Add platform REST client methods, clients and named types — paths checked against swagger, expectOk, jsonOrUndefined for not-found, requireFields/requireEach over generated models"
argument-hint: "<area> <endpoint-or-method>"
---

## REST Client Layer

Specs never build REST requests themselves: they call a client in `api/rest/clients/`, which returns named types from `api/rest/types/` built on the generated swagger models.

## File Locations

- Clients: `api/rest/clients/<area>-client.ts` → `PromotionsClient`
- Named types: `api/rest/types/<area>.ts`
- Generated models (never edit): `api/rest/generated/rest-api.ts` (`npm run codegen:rest` from `BACKEND_BASE_URL/docs/PlatformUI/swagger.json`)
- HTTP: `api/http/http-client.ts` (`get`, `post`, `put`, `delete`, `send`; options `query`, `json`, `form`, `multipart`, `headers`, `timeoutMs`), `api/http/http-response.ts`

## Step 1: Verify the Endpoint

Find the path, method, parameters and models in the swagger (or the generated file) before writing code. Paths guessed from names are often wrong (e.g. role creation is PUT, API keys live under `/api/platform/security/users/apikeys`).

## Step 2: Named Types

```ts
import type { WithRequired } from "@core/required-fields";
import type {
  VirtoCommerceMarketingModuleCoreModelPromotionsPromotion as PromotionData,
  VirtoCommerceMarketingModuleCoreModelPromotionsSearchPromotionSearchResult as PromotionSearchResult,
} from "../generated/rest-api";

export type { PromotionData, PromotionSearchResult };

export const PROMOTION_FIELDS = ["id", "name"] as const;

export type Promotion = WithRequired<PromotionData, (typeof PROMOTION_FIELDS)[number]>;
```

- Re-export generated models under short names: `XxxData`, `XxxSearchCriteria`, `XxxSearchResult`
- `XXX_FIELDS` lists the fields the tests rely on being present; `Xxx` makes them required
- Export only what clients or specs use

## Step 3: Client

```ts
const PROMOTIONS_PATH = "/api/marketing/promotions";

export class PromotionsClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async get(id: string): Promise<Promotion> {
    return requireFields(await this.find(id), PROMOTION_FIELDS, `Promotion "${id}"`);
  }

  async find(id: string): Promise<Promotion | undefined> {
    const response = await this.#httpClient.get(`${PROMOTIONS_PATH}/${encodeURIComponent(id)}`);
    const promotion = response.jsonOrUndefined<PromotionData>();
    return promotion === undefined ? undefined : requireFields(promotion, PROMOTION_FIELDS, `Promotion "${id}"`);
  }

  async create(promotion: PromotionData): Promise<Promotion> {
    const response = await this.#httpClient.post(PROMOTIONS_PATH, { json: promotion });
    return requireFields(response.expectOk().json<PromotionData>(), PROMOTION_FIELDS, "Created promotion");
  }

  async update(promotion: PromotionData): Promise<void> {
    (await this.#httpClient.put(PROMOTIONS_PATH, { json: promotion })).expectOk();
  }

  async search(criteria: PromotionSearchCriteria): Promise<Promotion[]> {
    const response = await this.#httpClient.post(`${PROMOTIONS_PATH}/search`, { json: criteria });
    const { results } = response.expectOk().json<PromotionSearchResult>();
    return requireEach(results, PROMOTION_FIELDS, "Found promotion");
  }

  async delete(id: string): Promise<void> {
    (await this.#httpClient.delete(PROMOTIONS_PATH, { query: { ids: id } })).expectOk();
  }
}
```

**Response handling:**
- `expectOk()` on every call: a non-2xx answer throws `HttpError` with method, URL, status and the start of the body
- `jsonOrUndefined<T>()` for "not found": it covers 404, 204, an empty body and `null`, which different modules use
- `json<T>()` is an unchecked cast; `requireFields` / `requireEach` check the fields the type requires
- `parse(schema)` with a zod schema when the shape itself must be validated (see `HealthClient`)
- Path segments go through `encodeURIComponent`; query parameters through the `query` option (arrays repeat the key)

**Shape:**
- `get…()` throws when missing, `find…()` returns `undefined`
- Methods return named types (`Promotion`), or `void` when the endpoint returns nothing useful
- Security endpoints return `SecurityResult`; callers check `succeeded` (`expectSucceeded` in helpers, `expect` in tests)
- Areas with several resources of the same shape use one generic resource class (`MemberResource`, `DynamicContentResource`)
- Endpoints that start a background job return a push notification: type it with a required `id`, and add a `find…(notificationId)` method built on `findPushNotification` (`api/rest/clients/push-notifications.ts`, e.g. `findProgress`, `findEvaluation`); tests poll it until `finished` and then check `errorCount`, never the job state

## Step 4: Use It

```ts
const promotionsClient = new PromotionsClient(httpClient);
```

Clients are created per test from a fixture HTTP client: `httpClient` (the `user` option), `platformAdminHttpClient` or `anonymousHttpClient`. Data setup that several specs share goes into `dataset/arrange/<area>.ts` on top of the client.

## Rules

1. Paths and methods verified against swagger; path constants at the top of the client file
2. `readonly #httpClient`; methods `async`, with explicit return types
3. `expectOk()` on every call; `jsonOrUndefined()` for every `find…()`
4. Results checked with `requireFields` / `requireEach`; no `?? []` around results
5. Named types in `api/rest/types/`; never edit `api/rest/generated/`
6. No test logic, assertions or cleanup in clients
7. Remove methods nothing calls
