---
name: write-rest-api-test
description: "Write REST API specs following project patterns — the api fixture signed in with test.use({ user }), direct HttpClient calls typed with the generated REST types, arrange for test data and cleanup, arrange/act/assert steps"
argument-hint: "<platform-module> <test-scenario>"
---

## REST API Spec Writing

Specs live in `<suiteDir>/tests/restapi/<platform-module>/<topic>.spec.ts` and run in the REST project (a key of
`commands.test` in the project facts). Place them by the platform module that owns the behaviour. A test that changes
platform-wide state (global settings, index, restart, store access) goes to the isolated directory instead.

Read first: skill `framework-rules`, then `project-facts` (`node .claude/checks/project-facts.mts`). Copy the shape
of a neighbouring spec of the same project.

## Step 1: Find the Building Blocks

- The endpoint: there are no REST clients. Call it directly on the `api` fixture (`HttpClient`) and type the body with
  the generated types in `@rest/generated/platform.ts` (search the file for the operation's model, imported as a short
  alias). Missing or outdated types: regenerate with `npm run codegen:vc:rest` (needs the running platform), never
  edit the file.
- Test data: `arrange.<domain>.<x>()` (`virtocommerce/arrange/<domain>.ts`). Missing one? Add a method to the domain
  file, on top of a builder in `virtocommerce/builders/`.
- Payloads for a create under test: `newX()` builders from `@builders/<area>.ts`; they give unique names and, where the
  platform keeps it, a client-side `id`.
- Seeded records: `dataset.<collection>.get(id)`; ids come from `virtocommerce/dataset/data/<collection>/*.json`, never
  from memory.
- Identities: the credentials of `roles["<role>"]` from the project facts, as the suite's dataset users export them
  (`@dataset/users.ts`); any other dataset user is `credentialsOf("<user name>")` from the same file.

## Step 2: Write the Spec

```ts
import type { VirtoCommercePricingModuleCoreModelPricelist as Pricelist } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newPricelist } from "@builders/pricing.ts";
import { ROLE_ACCOUNT } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

const PRICELISTS_PATH = "/api/pricing/pricelists";

test.describe("pricelists (<role>)", () => {
  test.use({ user: ROLE_ACCOUNT });

  test("create a pricelist", async ({ api, arrange, store }) => {
    const draft = newPricelist(store.defaultCurrency);
    arrange.pricing.deletePricelistLater(draft.id);

    const pricelist = await test.step("act: create a pricelist", async () =>
      (await api.post(PRICELISTS_PATH, { json: draft })).expectOk().json<Pricelist>());

    await test.step(`assert: the pricelist is in ${store.defaultCurrency}`, () => {
      expect(pricelist).toMatchObject({ name: draft.name, currency: store.defaultCurrency });
    });
  });

  test("delete a pricelist", async ({ api, arrange }) => {
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());

    await test.step("act: delete the pricelist", async () =>
      (await api.delete(PRICELISTS_PATH, { query: { ids: [pricelist.id] } })).expectOk());

    await test.step("assert: the pricelist is not found by id", async () => {
      expect(await pricelistOf(api, pricelist.id)).toBeUndefined();
    });
  });
});

async function pricelistOf(api: HttpClient, id: string): Promise<Pricelist | undefined> {
  return (await api.get(`${PRICELISTS_PATH}/${id}`)).optionalJson<Pricelist>();
}
```

- `test.describe("<topic> (<who>)")`, one per identity, named by role: `(<role>)`, `(anonymous)`,
  `(customer of their own)`.
- `test.use({ user: <Credentials> })` signs `api` in; the account is `roles["<role>"]` from the project facts. Without
  it `api` is anonymous. `http` is always anonymous; `signIn(credentials)` returns a client signed in as another
  user in the same test. An administration test runs as `roles[roleFor.admin]`.
- `arrange` creates as `roleFor.admin` and removes the data after the test.
- When the create is the action under test, build the draft (`newX()` sets a client-side `id`) and register the
  `…Later` removal before the call. When the platform assigns the id, register it right after the act.
- Paths are module-level constants (`PRICELISTS_PATH`). A read several tests repeat is a `function` declaration at the
  end of the spec.

## Step 3: Pick the Pattern

**Requests.** `api.get(path, { query })`, `api.post(path, { json })`, `api.put(path, { json })`,
`api.delete(path, { query: { ids: [id] } })`; `multipart` and `form` bodies for uploads and forms. The client never
throws on a status: `expectOk()` fails on a non-2xx status, `json<T>()` reads a success body, `optionalJson<T>()`
returns `undefined` for an empty or `null` body, and `{ allow404: true }` also for a 404 answer.

**Expected errors.** Check the status and the body text, one request per case:

```ts
const response = await api.post(`${ASSETS_PATH}/folder`, { json: { name: "", parentUrl: "" } });
expect(response.status).toBe(400);
expect(response.text).toContain("Folder name must not be empty");
```

`response.errorJson<T>()` reads an error body as JSON; it fails on a success status.

**Missing records.** A read of a deleted record returns `undefined` through `optionalJson` (add `{ allow404: true }`
for an endpoint that answers 404). Prove a deletion by id, never with a search.

**Another identity.** Headers for one client: `http.withHeaders({ api_key: value.reveal() })` (see
`tests/restapi/security/api-keys.spec.ts`).

**Repeated cases.** One table, one loop; rows may hold small lambdas:

```ts
const INVALID_FOLDER_NAMES = [
  { title: "whitespace only", name: " ", reason: "Folder name must not be empty" },
  { title: "too long", name: "a".repeat(300), reason: "Maximum length is 63" },
] as const;

for (const { title, name, reason } of INVALID_FOLDER_NAMES) {
  test(`reject a folder name that is ${title}`, async ({ api, store }) => { … });
}
```

**Index-backed reads.** Wait in `arrange` (e.g. `arrange.customers.searchableMemberships`) or poll in the assertion:

```ts
await expect
  .poll(async () => (await searchPricelists(api, pricelist.name)).map(({ id }) => id), {
    timeout: INDEX_LAG_TIMEOUT_MS,
  })
  .toContain(pricelist.id);
```

`INDEX_LAG_TIMEOUT_MS` comes from `@support/poll.ts`.

**Store settings.** `arrange.platform.storeSetting(name, value)` restores the old value after the test. Global
settings (`arrange.platform.setting`, `allowedValue`, `restoreSettingLater`) are for the isolated tests only.

**Optional modules.** `test.use({ modules: { pickup: MODULES.pickup } })` (`@modules`) on the describe, next to
`user`.

**Platform defects.** The test asserts the correct behaviour and stays failing. With a tracker ticket, add
`{ annotation: { type: "issue", description: "<ticket URL>" } }` as the test's details; never `test.fail`.

## Assertions

```ts
expect(entity).toMatchObject({ name: draft.name });
expect(found.map(({ id }) => id)).toContain(entity.id);
expect(await pricelistOf(api, id)).toBeUndefined();
```

Never `toEqual([...])` on a whole search result: other tests create data in parallel.

## Rules

1. `test`, `expect` from `@fixtures`; never from `@playwright/test`.
2. Every phase is a `test.step("arrange: …" | "act: …" | "assert: …")`.
3. No conditionals or `as` casts in the spec; constants at module level in `UPPER_SNAKE_CASE`.
4. Seeded data from `dataset`; created data from `arrange` or a builder; unique names come from builders.
5. Removal registered by `arrange`; a `…Later` method registers the removal of what the code under test creates.
6. Bodies typed with `@rest/generated/platform.ts`; success bodies through `expectOk().json<T>()`.
7. Missing data fails loudly: `requireFields(value, [...], label)`, never `?? ""` or `?? []`.
8. No sleeps; index lag is waited for in `arrange` or with `INDEX_LAG_TIMEOUT_MS`.
9. Style (comments, naming, wording) comes from the repository's `CLAUDE.md`.

## Verify

Run `commands.typecheck`, `commands.lint` and `commands.test["restapi"]` (the REST project's key) from the project facts
on the changed spec, with the run record the expert agent describes.

## Example from this repository

- Reference specs: `virtocommerce/tests/restapi/pricing/pricelists.spec.ts`,
  `virtocommerce/tests/restapi/security/api-keys.spec.ts`, `virtocommerce/tests/restapi/content/validation.spec.ts`.
- Identities: `(store administrator)`, which is our `roleFor.admin` (`user: STORE_ADMINISTRATOR`), `(anonymous)`,
  `(customer of their own)`.
- Place by module: users, roles and API keys are `security`, not `customer`.
- Commands: `npm run typecheck && npm run check`, then:

  ```shell
  npx --no playwright test --config=virtocommerce --no-deps virtocommerce/tests/restapi/<platform-module>/<topic>.spec.ts --project=restapi
  ```
