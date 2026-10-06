---
name: migrate-katalon-module
description: "Migrate a Katalon REST API test module from vc-quality-gate-katalon into this TypeScript Playwright project — end-to-end flow from inventory to CI-verified PR"
argument-hint: "<KatalonModule> [jira-ticket]"
user-invocable: true
---

## Katalon → Playwright Migration Flow

Migrate one Katalon module (e.g., `ModuleCatalog`, `Contacts`, `ModulePricing`) from `VirtoCommerce/vc-quality-gate-katalon` into `tests/restapi/<area>/`.

**CRITICAL LESSON:** Always read the Katalon Object Repository `.rs` files FIRST to get the real endpoint URLs and HTTP methods. Never guess endpoints from test names — they are often wrong (e.g., `/apiaccounts` vs `/users/apikeys`, POST vs PUT for role creation). Confirm each against the generated swagger types in `api/rest/generated/rest-api.ts`.

---

## Step 1: INVENTORY — List all Katalon scripts

```bash
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Scripts/API%20Coverage/<KatalonModule>" --jq '.[].name' | sort
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Scripts/API%20Coverage/<KatalonModule>/<Folder>" --jq '.[].name'
```

Mark each script:
- `REAL` — a test to migrate
- `DRAFT` — skip (folder name starts with DRAFT or contains draft)
- `DEPRECATED` — skip
- `TEMPLATE` — skip (`_suiteTemplate`, `z_snippet_*`)
- `UTILITY` — skip (helper called by other scripts)

Count the REAL scripts; that is the target.

---

## Step 2: ENDPOINTS — Read Object Repository `.rs` files

**DO THIS BEFORE WRITING ANY CODE.**

```bash
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Object%20Repository/API/backWebServices" --jq '.[].name' | sort
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Object%20Repository/API/backWebServices/<VirtoCommerce.Module>" --jq '.[].name' | sort
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Object%20Repository/API/backWebServices/<VirtoCommerce.Module>/<Name>.rs" --jq '.content' | base64 -d | grep -E 'restRequestMethod|restUrl'
```

**Output:** for every API action, the verified HTTP method, URL path (with placeholders) and body kind (JSON, form, multipart, none).

**Gotchas found in earlier migrations:**
- Roles are created with PUT, not POST
- Password reset uses `{userName}` in the path, not `{userId}`
- API key POST returns an empty body: find the created key by its value afterwards
- Dynamic properties: `objectType` goes in the body, not the path
- Asset upload from a URL is a POST with query parameters, not JSON
- Asset delete: DELETE with `?urls=`, not POST to `/delete`
- OAuth apps: `/api/platform/oauthapps`
- Notification journal search is POST; `markAllAsRead` is camelCase
- Module restart: `/api/platform/modules/restart`
- "Not found" differs per module: 404, `200 null`, `200 ""` — `HttpResponse.jsonOrUndefined()` handles all of them

---

## Step 3: CLIENT AND TYPES

Extend the client for the area in `api/rest/clients/<area>-client.ts` or create one (see `/create-rest-client`):

```ts
const PROMOTIONS_PATH = "/api/marketing/promotions";

export class PromotionsClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async create(promotion: PromotionData): Promise<Promotion> {
    const response = await this.#httpClient.post(PROMOTIONS_PATH, { json: promotion });
    return requireFields(response.expectOk().json<PromotionData>(), PROMOTION_FIELDS, "Created promotion");
  }
}
```

**Rules:**
- Path constants and HTTP methods match the `.rs` file and swagger
- Every call ends in `expectOk()`; `find…()` uses `jsonOrUndefined()`
- Named types in `api/rest/types/<area>.ts`: re-export the generated model as `XxxData`, add `XXX_FIELDS` and `type Xxx = WithRequired<XxxData, (typeof XXX_FIELDS)[number]>`
- If a create returns an empty body, read the entity back (by id when the draft sets one, otherwise by a unique value)

---

## Step 4: DATA HELPERS

- `dataset/builders/<area>.ts`: `newXxx()` returns a valid draft with a unique name (`uniqueId("test-xxx")`) and a client-side `id` (`crypto.randomUUID()`) when the API accepts one, so cleanup can be registered before the create
- `dataset/arrange/<area>.ts`: `arrangeXxx(client, cleanupStack, draft)` creates and registers its own cleanup, when several specs need the same setup
- Seeded ids used by more than one spec: `dataset/seeded.ts`

---

## Step 5: SPECS

Create `tests/restapi/<area>/<feature>.spec.ts` (see `/write-rest-api-test`):

- `test.beforeEach(async () => { await allure.feature("<Area> / <Feature>") })`
- `test.describe("<feature> (admin)", ...)` with `test.use({ user: asWorkerAdministrator })`
- `arrange:` / `act:` / `assert:` steps; cleanup pushed next to each creation
- Global-state tests (settings, dynamic properties, module reload): `test.describe.configure({ mode: "default" })`, `arrangeSettingValue` or `registerSettingRestore`
- Restart or reload of the platform: `{ tag: "@destructive" }`
- Katalon scripts that repeat one pattern with different data (e.g. dynamic properties across object types) become one loop over cases

---

## Step 6: LOCAL VERIFICATION

```bash
npm run typecheck && npm run check
npx playwright test tests/restapi/<area>/
```

**Common failures:**
- `404 Not Found` → wrong path, re-check the `.rs` file and swagger
- `405 Method Not Allowed` → wrong HTTP method
- `response body is not valid JSON` → the endpoint answers with an empty body; read the entity back
- `has no <field>` from `requireFields` → the response lacks a field the named type requires; check the swagger model
- `succeeded: false` → check whether the endpoint takes a user name or an id

---

## Step 7: 1-TO-1 MAPPING CHECK

Build the table `Katalon script → test title → status` and verify:
- Every REAL script maps to exactly one test or one case of a loop
- 0 MISSING
- SKIP count equals DRAFT + DEPRECATED + TEMPLATE + UTILITY

---

## Step 8: CI + PR

1. Commit and push the branch
2. `gh pr create --base dev` with the mapping table in the description
3. `gh workflow run auto-tests.yml --ref <branch> -f testSuites=restapi`
4. Wait for a green run on every database; destructive tests only run when the env-file secret sets `RUN_DESTRUCTIVE_TESTS=true`
5. Merge after review

---

## Checklist

- [ ] All Katalon scripts inventoried
- [ ] All endpoints verified from `.rs` files and swagger (not guessed)
- [ ] Client methods and named types added
- [ ] Builders (and arrange helpers where shared) with cleanup
- [ ] Specs follow the steps, Allure and cleanup conventions
- [ ] `mode: "default"` on global-state files; `@destructive` on restarts
- [ ] Loops where Katalon repeats one pattern
- [ ] `npm run typecheck`, `npm run check` and the local run are green
- [ ] 1-to-1 mapping: 0 missing
- [ ] CI run green
