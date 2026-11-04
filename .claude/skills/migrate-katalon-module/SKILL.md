---
name: migrate-katalon-module
description: "Migrate a Katalon REST API test module from vc-quality-gate-katalon into this Playwright project — inventory, verified endpoints, api.rest clients, builders and arrange methods, specs, a script-to-test mapping in the PR and a CI-verified PR"
argument-hint: "<KatalonModule> [jira-ticket]"
user-invocable: true
---

## Katalon → Playwright Migration Flow

Migrate one Katalon module (e.g. `ModuleCatalog`, `Contacts`, `ModulePricing`) from
`VirtoCommerce/vc-quality-gate-katalon` into `tests/restapi/<platform-module>/`, or `tests/isolated/restapi/`
for scripts that change platform-wide state.

**Read the Katalon Object Repository `.rs` files first** to get the real endpoint URLs and HTTP methods. Never
guess endpoints from test names. Confirm each against `api/rest/generated/rest-api.ts`.

---

## Step 1: Inventory the Katalon Scripts

```bash
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Scripts/API%20Coverage/<KatalonModule>" --jq '.[].name' | sort
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Scripts/API%20Coverage/<KatalonModule>/<Folder>" --jq '.[].name'
```

Mark each script:
- `REAL`: a test to migrate.
- `DRAFT`, `DEPRECATED`: skip.
- `TEMPLATE` (`_suiteTemplate`, `z_snippet_*`), `UTILITY` (called by other scripts): skip.

Count the REAL scripts; that is the target. Then check the existing specs: they may already cover a script, so its
row becomes a merge, not a new test.

---

## Step 2: Verify Endpoints From `.rs` Files

**Do this before writing any code.**

```bash
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Object%20Repository/API/backWebServices" --jq '.[].name' | sort
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Object%20Repository/API/backWebServices/<VirtoCommerce.Module>" --jq '.[].name' | sort
gh api "repos/VirtoCommerce/vc-quality-gate-katalon/contents/Object%20Repository/API/backWebServices/<VirtoCommerce.Module>/<Name>.rs" --jq '.content' | base64 -d | grep -E 'restRequestMethod|restUrl'
```

Output: for every API action, the verified method, path (with placeholders) and body kind (JSON, form,
multipart, none).

Gotchas from earlier migrations:
- Roles are created with PUT, not POST.
- Password reset takes `{userName}` in the path, not `{userId}`.
- API key POST returns an empty body: find the key by its value afterwards.
- Dynamic properties: `objectType` goes in the body, not the path.
- Asset upload from a URL is a POST with query parameters; asset delete is DELETE with `?urls=`.
- OAuth apps: `/api/platform/oauthapps`. Module restart: `/api/platform/modules/restart`.
- Notification journal search is POST; `markAllAsRead` is camelCase.
- "Not found" differs per module (404, `200 null`, `200 ""`): `optionalJson()` covers empty and `null`;
  pass `{ allow404: true }` only where the module answers 404.

---

## Step 3: Client and Types

Extend `api/rest/clients/<module>-client.ts` or add a client registered in `api/rest/rest-api.ts` (see
`/create-rest-client`). Specs reach it as `api.rest.<module>`.

- Path constants and methods match the `.rs` file and Swagger.
- `expectOk()`, or a response checked against a shape: `record`, `optionalRecord`, `records`, `results`.
- Named types in `api/rest/types/<module>.ts`: `XData`, a shape `X = shape<XData>()("Label", [...])`, and
  `type X = Shaped<typeof X>`.
- A create that returns an empty body: read the record back (by the draft's id, or a unique value).

---

## Step 4: Test Data

- `dataset/builders/<domain>.ts`: `newX()` returns a valid draft with a unique name (`uniqueId("test-x")`) and a
  client-side `id` (`randomUUID()`) when the platform keeps it, so cleanup can be registered first.
- `dataset/arrange/<domain>.ts`: an `arrange.<domain>.x()` method that creates and registers its own cleanup,
  when tests need the record as setup.
- Records the tests only read: the seed dataset (`dataset/data/<collection>/`), read through `dataset.x.get(id)`.
- Katalon's hard-coded ids and names become dataset ids or builder output, never literals copied over.

---

## Step 5: Specs

Create `tests/restapi/<platform-module>/<topic>.spec.ts` (see `/write-rest-api-test`):

- `allure.epic("REST API")` and `allure.feature("<Module> / <Topic>")` in `beforeEach`; `allure.story` and
  `allure.description` per test.
- `test.describe("<topic> (store administrator)")` with `test.use({ user: "acme_store_administrator@acme.com" })`.
- `arrange:` / `act:` / `assert:` steps; data from `arrange`; cleanup registered before each change.
- Place by platform module: Katalon's users, roles and API keys go to `security`, not `customer`.
- Scripts that change global settings, reload modules, restart the platform or rebuild the index go to
  `tests/isolated/restapi/<platform-module>/`.
- Scripts that repeat one pattern with different data become one table-driven test.
- A script that exposes a platform defect: add it to `dataset/known-issues.ts` and start the test with
  `await knownIssue(KNOWN_ISSUES.x)`.
- Katalon checks that assert nothing, or only a status code, get a real assertion on the record.

---

## Step 6: Local Verification

```bash
npm run typecheck && npm run check
npx playwright test --list
npm run test:restapi -- tests/restapi/<platform-module>/
RUN_DESTRUCTIVE_TESTS=true npm run test:isolated -- tests/isolated/restapi/<platform-module>/
```

Common failures:
- `404 Not Found`: wrong path; re-check the `.rs` file and Swagger.
- `405 Method Not Allowed`: wrong HTTP method.
- `response body is not valid JSON`: the endpoint answers with an empty body; read the record back.
- `has no <field>` from `requireFields`: the response lacks a field the named type requires; check the model.
- `succeeded: false`: check whether the endpoint takes a user name or an id.

---

## Step 7: 1-to-1 Mapping

Build the table `Katalon script → test title → status` and check:
- every REAL script maps to one test, one table row, or a named merge;
- 0 missing;
- skipped = DRAFT + DEPRECATED + TEMPLATE + UTILITY.

Put the mapping in the PR description, one row per REAL script: Katalon script, test (or the existing test it merges
into), what it checks, and the decision (migrate, parameterize, merge, isolate, or drop with a reason).

---

## Step 8: CI and PR

1. Commit and push the branch.
2. `gh pr create --base dev` with the mapping table in the description.
3. `gh workflow run auto-tests.yml --ref <branch> -f testSuites=restapi` (and `-f testSuites=isolated` when the
   module has isolated tests; that needs `RUN_DESTRUCTIVE_TESTS=true` in the env secret).
4. Wait for a green run on every database; merge after review.

---

## Checklist

- [ ] All Katalon scripts inventoried; overlaps with existing specs found
- [ ] All endpoints verified from `.rs` files and Swagger
- [ ] Client methods registered on `api.rest`, named types added
- [ ] Builders and arrange methods register cleanup before the change
- [ ] Specs follow steps, Allure, placement and no-conditionals rules
- [ ] Platform-wide changes in `tests/isolated/`; defects through `knownIssue`
- [ ] Tables where Katalon repeats one pattern
- [ ] `npm run typecheck`, `npm run check`, `--list` and the local run are green
- [ ] Mapping: 0 missing; in the PR description
- [ ] CI run green
