# vc-testing-module

Automated tests for the Virto Commerce **platform** (REST API and xAPI GraphQL), the **frontend** (vc-frontend) and the **page-builder shell** in the platform admin. TypeScript on Playwright Test, Allure reporting, Biome for lint and format. [README.md](README.md) is the full guide; this file is the short version for working in the code.

## Commands

```shell
npm install                      # dependencies + pre-commit hook (biome check + tsc)
npx playwright install chromium  # browser for the e2e projects
npm run seed                     # load dataset/data into the platform (once per platform)
npm test                         # restapi, graphql, e2e-frontend, e2e-backend
npm run test:restapi             # one project; also test:graphql, test:e2e:frontend, test:e2e:backend
npx playwright test tests/graphql/cart/cart-items.spec.ts       # one file
npx playwright test --project=graphql --grep "add several"      # by title
npx playwright test --list       # load every spec and fixture without running anything
npm run typecheck                # tsc --noEmit
npm run check                    # biome lint + format + import order, with fixes
npm run codegen                  # regenerate REST + GraphQL types from the running platform
```

Settings come from `.env` (template: `.env.example`), validated by `core/env.ts`.

## Layers

Each folder may import only the layers listed; `biome/layers.json` enforces it.

| Folder | Holds | May import |
|---|---|---|
| `core/` | env, logger, cleanup stack, `requireFields`/`requireEach`, `parseOrThrow`, `uniqueId`, `daysFromNow` | nothing |
| `api/` | `HttpClient`, auth, REST clients + types, GraphQL client + `.graphql` documents | `core` |
| `pages/` | page objects: locators and UI actions only | `core` |
| `dataset/` | seeded JSON data, `seeded.ts` constants, `builders/` (`new…()`), `arrange/` (`arrange…()` + cleanup) | `api`, `core` |
| `fixtures/` | Playwright fixtures, merged in `fixtures/index.ts` | everything but `tests` |
| `tests/` | specs per project: `restapi/`, `graphql/`, `e2e/frontend/`, `e2e/backend/`, `setup/` | everything; `test`/`expect` only from `@fixtures` |

Aliases: `@core/*`, `@api/*`, `@dataset/*`, `@pages/*`, `@fixtures`. Generated code (`api/rest/generated`, `api/graphql/generated`) is never edited by hand.

## Writing tests

- `test.beforeEach(async () => { await allure.feature("<Area> / <Topic>") })` at the top of each spec; one `test.describe("<topic> (<who>)")` per role, e.g. `(admin)`, `(anonymous)`, `(customer account)`.
- Every test is `test.step("arrange: …")`, `test.step("act: …")`, `test.step("assert: …")`.
- Who calls the API: `test.use({ user: asWorkerAdministrator })` (an administrator created for each worker, so parallel tests never share credentials), `seededUser(SEEDED_USERS.x)` only when the test needs that seeded identity (read-only), the anonymous default, `platformAdminHttpClient` (also the worker's administrator), or a fresh `customerAccount`. Tests that change account state (carts, lists, addresses, organizations) use `customerAccount`; seeded data is read-only.
- Seeded ids and usernames come from `dataset/seeded.ts`, never as string literals in specs.
- Anything a test creates is built by a `new…()` builder with `uniqueId(prefix)`, created through an `arrange…()` helper or a client, and undone through `cleanupStack.push(...)` right after creation (before it when the id is known up front).
- Browser state before the test starts: `test.use({ browserCustomerAccount: withCustomerAccount })`, `test.use({ cart: withItems([...]) })`.
- Wait with `expect(locator)…` and `expect.poll(...)`; never `waitForTimeout` or `networkidle`.
- Known product issues: `test.fail(true, describeIssue(KNOWN_ISSUES.<key>))`, with the issue added to `dataset/known-issues.ts` (tracker key and summary). Tests that restart or reload the platform: `{ tag: "@destructive" }` (skipped unless `RUN_DESTRUCTIVE_TESTS=true`). A file whose tests share global state: `test.describe.configure({ mode: "default" })`.
- Missing data must fail loudly: `requireFields(value, [...], label)` instead of `?? ""`, `?? []` or `?? 0`.

## Code style

- TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; no `any`, no `!` non-null assertions, no floating promises (all enforced).
- Named and exported functions are `function` declarations; arrow functions only for inline callbacks.
- Classes keep state in `readonly #private` fields; page objects expose `readonly` locators built in the constructor.
- No comments in code unless they explain something the code cannot say.
- Say **frontend** (not storefront), **platform** (the VC backend) and **platform admin** (the admin account and UI).
- Match the surrounding file: naming, step wording, import order (`npm run check` sorts imports).

## Before handing work over

1. `npm run typecheck` and `npm run check` are clean.
2. `npx playwright test --list` loads every spec (catches fixture wiring mistakes).
3. The changed specs pass against a seeded platform.

Open work and decisions are tracked in [REFINEMENTS.md](REFINEMENTS.md).
