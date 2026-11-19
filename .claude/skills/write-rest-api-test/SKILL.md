---
name: write-rest-api-test
description: "Write REST API specs following project patterns — the api fixture signed in as a dataset user, api.rest clients, arrange for test data, cleanup registered before the change, arrange/act/assert steps, Allure epic/feature/story"
argument-hint: "<platform-module> <test-scenario>"
---

## REST API Spec Writing

Specs live in `tests/restapi/<platform-module>/<topic>.spec.ts` and run in the `restapi` project. Place them by
the platform module that owns the behaviour. A test that changes platform-wide state
(global settings, index, restart, store access) goes to `tests/isolated/restapi/` instead.

Read first: skill `framework-rules`, then `project-facts` (`node .claude/qa/project-facts.mts`), then the repository's
README for its REST test shape. Copy the shape of a neighbouring spec of the same project.

## Step 1: Find the Building Blocks

- Client method: `api.rest.<module>.<resource>.<method>` (`api/rest/rest-api.ts` lists every client). Missing one?
  Add it with `/create-rest-client`.
- Test data: `arrange.<domain>.<x>()` (`dataset/arrange/`, domains in the README's `arrange` section). Missing one?
  Add a method to the domain file, on top of a builder in `dataset/builders/`.
- Seeded records: `dataset.<collection>.get(id)`; ids come from `dataset/data/<collection>/*.json`, never from memory.
- Known defect: an entry in `known-issues.json`.

## Step 2: Write the Spec

```ts
import * as allure from "allure-js-commons";

import { newPricelist } from "@dataset/builders/pricing";
import { expect, test } from "@fixtures";

const ROLE_ACCOUNT = "<roles[role] from the project facts>";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Pricing / Pricelists");
});

test.describe("pricelists (<role>)", () => {
  test.use({ user: ROLE_ACCOUNT });

  test("create a pricelist", async ({ api, cleanup, store }) => {
    await allure.story("Create");
    await allure.description("A new pricelist has its name and the store's currency.");
    const draft = newPricelist(store.defaultCurrency);
    cleanup.push(`delete pricelist ${draft.name}`, () => api.rest.pricing.pricelists.delete([draft.id]));

    const pricelist = await test.step("act: create a pricelist", () => api.rest.pricing.pricelists.create(draft));

    await test.step(`assert: the pricelist is in ${store.defaultCurrency}`, () => {
      expect(pricelist).toMatchObject({ name: draft.name, currency: store.defaultCurrency });
    });
  });

  test("delete a pricelist", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A deleted pricelist cannot be read by its id.");
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());

    await test.step("act: delete the pricelist", () => api.rest.pricing.pricelists.delete([pricelist.id]));

    await test.step("assert: the pricelist is not found by id", async () => {
      expect(await api.rest.pricing.pricelists.find(pricelist.id)).toBeUndefined();
    });
  });
});
```

- `allure.epic("REST API")` and `allure.feature("<Module> / <Topic>")` in `beforeEach`; `allure.story` and
  `allure.description` first in each test.
- `test.describe("<topic> (<who>)")`, one per identity, named by role: `(<role>)`, `(anonymous)`,
  `(customer of their own)`.
- `test.use({ user: "<account>" })` signs `api` in; the account is `roles["<role>"]` from the project facts, as a
  string. Without it `api` is anonymous. Another identity in the same test: `await api.as(account)`,
  `api.anonymous()`.
- `arrange` creates as the administrator the repository configures and removes the data after the test. `arrange.admin` reads platform
  state in assertions when `api` is a less privileged user.
- When the create is the action under test, build the draft (`newX()` sets a client-side `id`) and push the
  undo on `cleanup` before the call.

## Step 3: Pick the Pattern

**Expected errors.**

```ts
await expect(api.rest.content.folders.create("pages", name)).rejects.toBeHttpError(400, reason);
await expect(api.rest.catalog.categories.get(id)).rejects.toBeHttpError(404);
```

**Missing records.** `find(id)` returns `undefined`; `get(id)` throws. Prove a deletion with `find(id)`, never
with a search.

**Security results.** `expect(result.succeeded).toBe(true)`, or
`expect(result).toMatchObject({ succeeded: false, errors: [...] })` for a rejection.

**Repeated cases.** One table, one loop; rows may hold small lambdas (see
`tests/restapi/marketing/dynamic-content.spec.ts`):

```ts
const CONTENT_KINDS = [
  { kind: "folders", record: "content folder" },
  { kind: "items", record: "content item" },
] as const;

for (const { kind, record } of CONTENT_KINDS) {
  test(`get a ${record} by id`, async ({ api, arrange }) => { … });
}
```

**Index-backed reads.** Wait in `arrange` (e.g. `arrange.customers.searchableMemberships`) or poll:

```ts
await expect
  .poll(async () => (await api.rest.customers.members.search({ keyword })).map(({ id }) => id), {
    timeout: INDEX_LAG_TIMEOUT_MS,
  })
  .toContain(member.id);
```

**Store settings.** `arrange.platform.storeSetting(name, value)` restores the old value after the test. Global
settings (`arrange.platform.setting`, `allowedValue`, `restoreSettingLater`) are for `tests/isolated/` only.

**Known defects.** Add the entry to the root `known-issues.json` and its name to `KNOWN_ISSUE_NAMES` in
`fixtures/known-issue.ts`, then start the test with it:

```ts
import { expect, KNOWN_ISSUES, knownIssue, test } from "@fixtures";

await knownIssue(KNOWN_ISSUES.channelSearchIgnoresFilters);
```

## Assertions

```ts
expect(entity).toMatchObject({ name: draft.name });         // fields the test controls
expect(found.map(({ id }) => id)).toContain(entity.id);     // own record in a search result
expect(await client.find(id)).toBeUndefined();              // a deletion
```

Never `toEqual([...])` on a whole search result: other tests create data in parallel.

## Rules

1. `test`, `expect`, `knownIssue` from `@fixtures`; never from `@playwright/test`.
2. Every phase is a `test.step("arrange: …" | "act: …" | "assert: …")`.
3. No conditionals, `as` casts or helper functions in the spec; constants at module level in `UPPER_SNAKE_CASE`.
4. Seeded data from `dataset`; created data from `arrange` or a builder; unique names come from builders.
5. Cleanup registered before the change; `arrange` does it for you. A `…Later` method registers the removal of
   what the code under test creates.
6. Missing data fails loudly: `requireFields(value, [...], label)`, never `?? ""` or `?? []`.
7. No sleeps; index lag is waited for in `arrange` or with `INDEX_LAG_TIMEOUT_MS`.
8. Style (comments, naming, wording) comes from the repository's `CLAUDE.md`.

## Verify

Run `commands.typecheck`, `commands.lint` and `commands.test["restapi"]` (the REST project's key) from the project
facts on the changed spec, with the run record the expert agent describes.

## Example from this repository

- Reference spec: `tests/restapi/pricing/pricelists.spec.ts`; README "A REST test" and "Cleaning up".
- Identities: `(store administrator)`, `(anonymous)`, `(customer of their own)`; the account of a role is
  `roles["store administrator"]` in `.qa/project.json`.
- Place by module: users, roles and API keys are `security`, not `customer`.
- Commands: `npm run typecheck && npm run check`, then
  `npm run test:restapi -- tests/restapi/<platform-module>/<topic>.spec.ts`.

