# Virto Commerce test suite

The tests of the Virto Commerce solution: the platform's REST API, the xAPI GraphQL API, the frontend (vc-frontend)
and the page builder app of the admin UI. The suite uses the framework at the root of this repository like any other
test suite does, by its package name, and runs from the repository root with the `:vc` npm scripts.

## Setup

1. Install the dependencies and Chromium from the repository root: `npm ci`, then `npx playwright install chromium`.
2. Create `virtocommerce/.env` with the variables below. A variable set in the shell wins over `.env`, such as
   `VERIFY_SSL=false npm run test:vc` for a frontend with a self-signed certificate.
3. Seed the dataset into the platform: `npm run seed:vc`. Seeding is safe to repeat.
4. Rebuild the search index in the admin UI after seeding. The seed turns off the platform's scheduled indexing, so
   that it cannot collide with tests that index, and nothing indexes the seeded data on its own.

| Variable                | Required | Meaning                                                                          |
| ----------------------- | -------- | -------------------------------------------------------------------------------- |
| `BACKEND_BASE_URL`      | yes      | The origin of the platform                                                       |
| `FRONTEND_BASE_URL`     | yes      | The origin of the frontend; the tests find the store under test by its host name |
| `ADMIN_USERNAME`        | yes      | The platform administrator                                                       |
| `ADMIN_PASSWORD`        | yes      | The administrator's password                                                     |
| `USERS_PASSWORD`        | yes      | The password of every dataset user                                               |
| `VERIFY_SSL`            | no       | `false` accepts self-signed certificates; `true` by default                      |
| `REQUEST_TIMEOUT_MS`    | no       | The timeout of one API request; 30000 by default                                 |
| `API_WORKERS`           | no       | The workers of the API projects; 4 by default                                    |
| `RUN_DESTRUCTIVE_TESTS` | no       | `true` lets the isolated tests run; `false` by default                           |
| `GOOGLE_MAPS_API_KEY`   | no       | Written into the settings of the seeded store; maps stay off without it          |
| `SEED_ONLY`             | no       | Comma-separated dataset collections to seed instead of all of them               |
| `PAGE_BUILDER_PATH`     | no       | The path of the page builder app; `/apps/page-builder-shell/` by default         |
| `QUANTITY_CONTROL`      | no       | The frontend's quantity control: `stepper` (default) or `button`                 |
| `RANGE_FILTER_TYPE`     | no       | The frontend's range filters: `slider` (default) or `default`                    |
| `CHECKOUT_MODE`         | no       | The frontend's checkout: `single-page` (default) or `multi-step`                 |

There is no store setting: the tests use the store that serves `FRONTEND_BASE_URL`, and fail with a clear message
when no store does.

## Commands

```shell
npm run seed:vc                    # seed the dataset
npm run test:vc                    # every project except the destructive tests
npm run test:vc -- --project=restapi  # one project: restapi, graphql, e2e-frontend or e2e-backend
npm run test:vc -- virtocommerce/tests/graphql/cart/cart-items.spec.ts   # one file
npm run test:vc -- -g "add several products"                            # by title
npm run test:vc:isolated           # the destructive tests, alone, after test:vc
npm run test:vc:unit               # the dataset checks; needs no platform and no .env
npm run facts:check                # the role permissions in .qa/project.json match the seed
npm run codegen:vc                 # regenerate the GraphQL and REST types from the running platform
npm run report:vc                  # the Allure report of the last run; report:vc:open opens it
```

## Projects

| Project        | Directory             | Runs                                                                             |
| -------------- | --------------------- | -------------------------------------------------------------------------------- |
| `seed`         | `setup/`              | Seeds the dataset; every other project depends on it                             |
| `restapi`      | `tests/restapi/`      | REST API tests                                                                   |
| `graphql`      | `tests/graphql/`      | xAPI GraphQL tests                                                               |
| `e2e-frontend` | `tests/e2e/frontend/` | Frontend tests in Chromium                                                       |
| `e2e-backend`  | `tests/e2e/backend/`  | Admin UI tests (page builder), one worker                                        |
| `isolated`     | `tests/isolated/`     | Tests that change global settings, one worker, only with `RUN_DESTRUCTIVE_TESTS` |

The dataset checks in `tests/unit/` run with their own config, `playwright.unit.config.ts`. They check that every
record id is unique, that every reference resolves to a record seeded earlier, and that the manifest keys are present
and unique, so broken data fails in seconds instead of halfway through a seed.

## Layout

| Path              | Holds                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------- |
| `fixtures/`       | `test` and `expect` (`@fixtures`): the framework's fixtures plus the suite's          |
| `arrange/`        | `arrange` (`@arrange`): creates test data and removes it after the test               |
| `builders/`       | `newX()` payloads with unique values                                                  |
| `support/`        | Small shared reads and helpers, such as `requireFields`, `uniqueId` and `pollUntil`   |
| `dataset/`        | The seed: `data/` records, `manifest.ts`, `finishers.ts`, the dataset users           |
| `pages/`          | Page objects of the frontend and the admin UI; see [pages/README.md](pages/README.md) |
| `graphql/`        | `.graphql` operations and the generated typed documents                               |
| `rest/generated/` | The generated REST types                                                              |
| `modules.ts`      | The platform modules the suite depends on, with the edge version it is proven on      |
| `scripts/`        | The REST type generator and the role-permission check                                 |

How to write a test, and the rules every test follows, are in [CLAUDE.md](../CLAUDE.md) and the `framework-rules`
skill (`.claude/skills/framework-rules/SKILL.md`).

## QA agents

`/qa <task>` in Claude Code runs the QA workflow on this suite: a planner writes a contract that a person approves,
an expert implements it, a judge and a reviewer check the result, and a healer repairs failing tests without moving an
expected value. The agents, commands and skills are in `.claude/`; the facts they work from (the suite directory,
commands, roles, quality limits) are in `.qa/project.json`. Their working files go to `.qa/` and are not committed.

## CI

The `Auto Tests Docker` workflow (`.github/workflows/auto-tests.yml`) runs the suite through `playwright-tests.yml` of
`VirtoCommerce/.github`. The platform, the frontends and the modules run the same shared workflow against this
repository's `dev` branch, so the project names (`restapi`, `graphql`, `e2e-frontend`, `e2e-backend`, `isolated`)
are a contract with all of them: never rename one. Their runs leave out the tests tagged `@platform-defect`, defects a ticket already tracks; ours runs them unless the `skipPlatformDefects` input is on. Start it from the Actions tab. Pull requests run the dataset
checks in the `CI` workflow.
