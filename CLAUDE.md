# vc-test-automation-framework

Automated tests for the Virto Commerce **platform** (REST API and xAPI GraphQL), the **frontend** (vc-frontend) and
the **page builder** app of the platform admin. TypeScript on Playwright Test, Allure reports, Biome for lint and
format. [README.md](README.md) is the full guide; this file is the short version for working in the code.
[REFINEMENTS.md](REFINEMENTS.md) lists planned refinements and what is left of the old suite's migration.

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
| `pages/` | page objects: `frontend/` (layouts, ui-kit, components, pages, flows), `backend/` (vc-shell, page-builder) | `core` |
| `dataset/` | seed data (`data/`, `manifest.ts`, `seed/`), typed access (`dataset.ts`), builders (`newX()`), `arrange/` | `api`, `core` |
| `fixtures/` | Playwright fixtures, exported from `fixtures/index.ts` with `knownIssue` and `KNOWN_ISSUES` (read from the root `known-issues.json`) | all but `tests` |
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

The framework rules (spec structure, layers, data and cleanup, waits, known defects, optional modules, working
discipline) live in the `framework-rules` skill, `.claude/skills/framework-rules/SKILL.md`. Read it before writing
or reviewing a test. A framework rule beats the style rules below.

## Code style

This repository's default style. A client repository replaces it with its own; framework rules do not change.

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
