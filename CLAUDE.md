# vc-test-automation-framework

Two things live here. The repository root is the framework package `@virtocommerce/test-automation-framework`
(`src/`, its unit tests in `tests/unit/`, its documentation in `docs/`). `virtocommerce/` is the Virto Commerce test
suite built on it: tests of the **platform** (REST API and xAPI GraphQL), the **frontend** (vc-frontend) and the
**page builder** app of the platform admin. TypeScript on Playwright Test, Allure reports, Biome for lint and format.
[README.md](README.md) and [docs/](docs/README.md) describe the framework; this file is the short version for working
in the code.

## Commands

```shell
npm ci && npx playwright install chromium   # dependencies, pre-commit hook, Chromium
npm run typecheck                    # framework, suite and docs examples
npm run check                        # Biome lint + format + import order, with fixes (check:ci without fixes)
npm run test:unit                    # framework unit tests (root playwright.config.ts, project unit)
npm run test:vc:unit                 # suite unit tests (dataset integrity), no platform, no .env
npm run seed:vc                      # write the dataset to the platform (safe to repeat; start indexing afterwards)
npm run test:vc                      # every non-destructive project; append -- --project=restapi (graphql, e2e-frontend, e2e-backend)
npm run test:vc -- virtocommerce/tests/graphql/cart/cart-items.spec.ts   # one file, repo-relative
npm run test:vc -- --project=restapi -g "rename a pricelist"                # by title
npm run test:vc:isolated             # the destructive project alone, one worker, needs RUN_DESTRUCTIVE_TESTS
npx playwright test --config=virtocommerce --list   # load every spec and fixture without running anything
npm run codegen:vc                   # build the framework, regenerate GraphQL + REST types from the running platform
npm run report:vc                    # Allure report of the last run
```

Every suite project depends on `seed`, so a run seeds first. The seed turns the scheduled platform indexing off:
start indexing by hand after seeding (CI has a step for it).

The suite's settings come from `virtocommerce/.env`, validated by `virtocommerce/env.ts` on top of the framework's
schema in `src/core/env.ts`. A shell variable wins over `.env`, e.g. `VERIFY_SSL=false npm run test:vc --
--project=e2e-frontend` for a self-signed local frontend. Never read, edit or print `.env`; the one exception is
`node .claude/checks/stand.mts`, which prints only the stand's origins.

## Layers

**Framework areas** (`src/<area>/`, each its own entry point `@virtocommerce/test-automation-framework/<area>`). An
area imports only the areas before it; `.biome/layers.json` enforces it, and the framework never imports suite code.

| Area       | Holds                                                                                                                                                            | May import                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `core`     | `Secret`, masking, env schemas, Playwright config helpers (`defaultRunOptions`, `defaultUse`, `defaultReporters`, `apiProject`, `e2eProject`, `DESTRUCTIVE_TAG`) | nothing                                      |
| `http`     | `HttpClient`, `HttpResponse`, `HttpError`                                                                                                                        | `core`                                       |
| `auth`     | credentials, tokens, the token client and manager, browser sessions                                                                                              | `core`, `http`                               |
| `graphql`  | `GraphqlClient`, `GraphqlError`, `graphqlCodegenConfig`                                                                                                          | `core`, `http`                               |
| `modules`  | installed modules, `ModuleRequirement`                                                                                                                           | `core`, `http`                               |
| `dataset`  | loading a dataset from JSON and seeding it, driven by a manifest                                                                                                 | `core`, `http`, `modules`                    |
| `fixtures` | `defaultFixtures`                                                                                                                                                | `core`, `http`, `auth`, `graphql`, `modules` |

Inside `src/` another area is imported as `@/<area>` and a file of the same area by a relative path. Framework unit
tests import `@/<area>`, never `src/`. The suite and `docs/examples/` import the framework by its package name only.

**Suite directories** (`virtocommerce/`, aliases from `virtocommerce/tsconfig.json`):

| Directory                                                       | Alias         | Holds                                                                                                 |
| --------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| `tests/restapi/<module>/`, `tests/graphql/<area>/`              |               | REST specs (project `restapi`), xAPI specs (project `graphql`)                                        |
| `tests/e2e/frontend/<area>/`, `tests/e2e/backend/page-builder/` |               | frontend specs (`e2e-frontend`), admin UI specs (`e2e-backend`, 1 worker)                             |
| `tests/isolated/{restapi,graphql}/`                             |               | specs that change global state (`isolated`, 1 worker, `DESTRUCTIVE_TAG`)                              |
| `tests/unit/`                                                   |               | suite unit tests, `*.test.ts`                                                                         |
| `setup/seed.setup.ts`                                           |               | project `seed`, which every other project depends on                                                  |
| `fixtures/`                                                     | `@fixtures`   | `test`, `expect` (with `toHaveConsistentTotals`)                                                      |
| `arrange/`                                                      | `@arrange`    | the `arrange` factory and its domains, `Shopper`, `customerOf`                                        |
| `builders/`                                                     | `@builders/*` | `newX()` payload builders with unique values                                                          |
| `support/`                                                      | `@support/*`  | `requireFields`, `uniqueId`, `pollUntil`, `INDEX_LAG_TIMEOUT_MS`, settings, `findStoreUnderTest`, ... |
| `dataset/`                                                      | `@dataset/*`  | `data/` JSON, `manifest.ts`, `users.ts` (dataset credentials), `stock.ts`                             |
| `pages/`                                                        | `@pages/*`    | page objects: `frontend/`, `backend/`, `shared/`; read `pages/README.md`                              |
| `graphql/`                                                      | `@graphql/*`  | `operations/<area>/*.graphql`, `fragments/`, `generated/` (never edited), `line-items.ts`             |
| `rest/generated/`                                               | `@rest/*`     | generated REST types `platform.ts` (never edited)                                                     |
| `modules.ts`                                                    | `@modules`    | `MODULES`: module id and the edge `minVersion` the suite is proven on                                 |

Specs and fixtures use the aliases; files inside `arrange/`, `builders/`, `support/` and `pages/` import each other by
relative paths. Page objects import only Playwright and other page objects. `pages/` holds one class per file, named
in kebab case (Biome enforces both). There are no REST clients: specs call the platform with `api.get/post/put/delete`
and type the body with `@rest/generated/platform.ts`.

## Fixtures

`virtocommerce/fixtures/index.ts` extends the framework's `defaultFixtures` (see `docs/concepts/fixtures.md`).

- Options, set only with `test.use`: `user` (dataset `Credentials` such as `STORE_ADMINISTRATOR`; who `api`,
  `graphql` and the admin UI act as; anonymous by default, and the admin UI then signs in as `ADMINISTRATOR`),
  `shopperAs` (`"anonymous"` by default, `"customer"` for a customer created for the test, or dataset `Credentials`)
  and `modules` (a record of `MODULES` entries; the test skips when one is missing or older).
- Test fixtures: `api` (`HttpClient` as `user`), `graphql` (`GraphqlClient` as `user`), `http` (anonymous), `signIn`,
  `arrange`, `shopper` (`api`, `graphql`, `storeContext`, `userId`, `credentials`), `frontend`, `pageBuilder`,
  `pageDesigner`.
- Worker fixtures: `env`, `dataset` (seeded records, `dataset.products.get(id)`), `store` (the store the frontend
  serves, read from the platform), `tokens`, `workerAdmin`.
- `arrange` creates data as the store administrator and removes it after the test, last first, each removal a
  `cleanup:` step. Domains: `customers`, `carts`, `orders`, `catalog`, `pickup`, `content`, `platform`, `mailbox`,
  `security`, `pricing`, `marketing`. `…Later` methods only register removal of what the code under test creates.

## Writing tests

The framework rules (spec structure, `arrange` and cleanup, waits, platform defects, module gating, isolated tests,
working discipline) live in the `framework-rules` skill, `.claude/skills/framework-rules/SKILL.md`. Read it before
writing or reviewing a test. A framework rule beats the style rules below.

## Code style

This repository's default style. A client repository replaces it with its own; framework rules do not change.

- TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; no `any`, no `!`, no
  floating promises (all enforced).
- Named and exported functions are `function` declarations; arrows only for inline callbacks.
- Classes keep state in `readonly #private` fields; page objects expose `readonly` locators built in the constructor.
- No code comments. Documentation comments on exported members are required in `src/` (formal style, see
  `docs/contributing/conventions.md`) and short in the suite: they say what the signature cannot (side effects,
  waits, when to use which).
- Say **frontend** (not storefront), **platform** (the VC backend), **platform admin** / **admin UI** (the admin
  account and UI), **directory** (not folder).
- Match the surrounding file: naming, step wording, import order (`npm run check` sorts imports).

## Before handing work over

1. `npm run typecheck` and `npm run check` are clean.
2. `npx playwright test --config=virtocommerce --list` loads every spec.
3. The changed specs pass against a seeded platform.
4. `npm run test:unit` passes when framework code changed, `npm run test:vc:unit` when suite code (dataset) changed.
5. A change to the framework's public API updates its concept page in `docs/concepts/` and the examples in
   `docs/examples/` (`npm run docs:check`), and adds a changeset (`npm run changeset`, files in `.changeset/`).
