# vc-testing-module

Automated tests for the Virto Commerce **platform** (REST API and xAPI GraphQL), the **frontend** (vc-frontend) and
the **page builder** app of the platform admin. TypeScript on Playwright Test, Allure reports, Biome for lint and
format. [README.md](README.md) is the full guide; this file is the short version for working in the code.
[TESTS.md](TESTS.md) maps every test of the old suite to where it lives now.

## Commands

```shell
npm ci && npm run install:browsers   # dependencies, pre-commit hook, Chromium
npm run seed                         # write dataset/data to the platform (safe to repeat; reindex afterwards)
npm run test:restapi                 # also test:graphql, test:e2e:frontend, test:e2e:backend, test:unit, test
npm run test:graphql -- tests/graphql/cart/cart-items.spec.ts   # one file
npm run test:restapi -- -g "rename a channel"                   # by title
npx playwright test --list           # load every spec and fixture without running anything
npm run typecheck                    # tsc --noEmit
npm run check                        # Biome lint + format + import order, with fixes
npm run codegen                      # regenerate REST + GraphQL types from the running platform
```

Settings come from `.env` (template `.env.example`), validated by `core/env.ts`. A shell variable wins over `.env`,
e.g. `VERIFY_SSL=false npm run test:e2e:frontend` for a self-signed local frontend. Never edit or print `.env`.

## Layers

Each folder imports only the folders before it; `biome/layers.json` enforces it.

| Folder | Holds | May import |
|---|---|---|
| `core/` | env, `Secret`, `CleanupStack`, `pollUntil` / `INDEX_LAG_TIMEOUT_MS`, `requireFields`, `uniqueId`, logger | nothing |
| `api/` | `ApiSession`, `HttpClient`, auth, REST clients + types, GraphQL client + `.graphql` documents, `Mailbox`, matchers | `core` |
| `pages/` | page objects: locators and UI actions | `core` |
| `dataset/` | seed data (`data/`, `manifest.ts`, `seed/`), typed access (`dataset.ts`), builders (`newX()`), `arrange/`, `known-issues.ts` | `api`, `core` |
| `fixtures/` | Playwright fixtures, exported from `fixtures/index.ts` with `knownIssue` | all but `tests` |
| `tests/` | `restapi/`, `graphql/`, `e2e/frontend/`, `e2e/backend/`, `isolated/`, `setup/`, `unit/` | all; Playwright only through `@fixtures` (except `unit/`) |

Aliases: `@core/*`, `@api/*`, `@dataset/*`, `@pages/*`, `@fixtures`. `@dataset/arrange` is the `arrange/index.ts`
facade. Generated code (`api/rest/generated`, `api/graphql/generated`) is never edited by hand.

## Fixtures

- `api`: an `ApiSession`, anonymous unless `test.use({ user: "<dataset user name>" })`. `api.rest.<module>`,
  `api.graphql.execute(Document, vars)`, `api.storeContext()` (store, culture, currency, user id), `api.as(user)`,
  `api.anonymous()`.
- `arrange`: creates data as the store administrator and removes it after the test, by domain: `customers`,
  `security`, `catalog`, `pricing`, `marketing`, `orders`, `carts`, `pickup`, `content`, `platform`.
  `…Later` methods only register removal of what the code under test creates. `arrange.admin` reads platform state.
- `dataset`, `store`: seeded records (`dataset.products.get(id)`) and the store under test.
- `cleanup`: the undo stack, for changes `arrange` has no method for.
- Browser: `shopper` (`test.use({ shopperKind: "customer" })` for a fresh signed-in customer), `frontend`
  (page objects built for `QUANTITY_CONTROL`, `RANGE_FILTER_TYPE`, `CHECKOUT_MODE`), `pageBuilder`.

## Writing tests

- `allure.epic` and `allure.feature` in `test.beforeEach`; `allure.story` and `allure.description` in each test;
  one `test.describe("<topic> (<who>)")` per identity, e.g. `(anonymous)`, `(store administrator)`,
  `(customer of their own)`.
- Every phase is `test.step("arrange: …")`, `test.step("act: …")` or `test.step("assert: …")`.
- No conditional logic, no `as` casts and no helper functions in specs; repeated cases are one table-driven test
  whose rows may hold small lambdas. No raw selectors in specs: add them to `pages/`.
- Read seeded data from `dataset` (a spec may name a dataset id as a constant). Create what the test changes with
  `arrange`. A test that changes a customer's own state (cart, lists, addresses, locks) creates its own customer.
- Register cleanup before the change. Builders give drafts a client-side `id` the platform keeps, so the undo
  can be pushed first.
- Prove a deletion by reading the record by id (`find(id)` is `undefined`), not by a search.
- Index-backed reads lag: wait in `arrange` (`searchableMemberships`, `pickupLocations`, `cartPickupLocations`,
  `productPickupLocations`, `lockMemberships`) or `expect.poll(…, { timeout: INDEX_LAG_TIMEOUT_MS })`. Never
  `waitForTimeout` or `networkidle`.
- Missing data fails loudly: `requireFields(value, [...], label)`, never `?? ""` or `?? []`.
- Expected errors: `rejects.toBeHttpError(status, "body text")`, `rejects.toBeGraphqlError("CODE")`.
- Known defects: add the entry to `dataset/known-issues.ts` and start the test with
  `await knownIssue(KNOWN_ISSUES.x)`. With a tracker key the test is an expected failure; without one it is skipped
  as `fixme`. Never a bare `test.fail` or `test.fixme`.
- Tests that change platform-wide state (settings, index, restart) go to `tests/isolated/`, which runs only with
  `RUN_DESTRUCTIVE_TESTS=true`.
- Place tests by platform module: users and accounts are `security`, not `customer`.

## Code style

- TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; no `any`, no `!`, no
  floating promises (all enforced).
- Named and exported functions are `function` declarations; arrows only for inline callbacks.
- Classes keep state in `readonly #private` fields; page objects expose `readonly` locators built in the constructor.
- No code comments. JSDoc is short and says what the signature cannot: side effects, waits, when to use which.
- Say **frontend** (not storefront), **platform** (the VC backend), **platform admin** (the admin account and UI).
- Match the surrounding file: naming, step wording, import order (`npm run check` sorts imports).

## Before handing work over

1. `npm run typecheck` and `npm run check` are clean.
2. `npx playwright test --list` loads every spec.
3. The changed specs pass against a seeded platform, and `npm run test:unit` passes when framework code changed.
4. TESTS.md is updated when a test of the old suite moved, merged or was dropped.
