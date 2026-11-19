# vc-test-automation-framework

Automated tests of the [Virto Commerce](https://virtocommerce.com) platform: the REST API, the xAPI (GraphQL), the
frontend (vc-frontend) and the page builder app of the admin UI. Built on Playwright and TypeScript.

## Key features

- **One test runner for everything.** REST, GraphQL, browser and unit tests are Playwright projects with shared
  fixtures, reports and configuration.
- **Typed clients.** REST types are generated from the platform's Swagger, GraphQL operations from its schema, so a
  platform change shows up as a type error, not a runtime surprise.
- **A seeded dataset.** `dataset/data` holds the store, catalog, customers, prices, orders and pages every test
  reads; the `seed` project writes it to a fresh platform.
- **Self-cleaning test data.** Tests create what they change through the `arrange` fixture, which removes it after
  the test in reverse order, so tests run in parallel and leave the platform as they found it.
- **Readable tests.** Every test is `arrange` / `act` / `assert` steps, table-driven where cases repeat, with no
  conditional logic and no raw selectors; page objects hide the frontend's configuration differences.
- **Safe by default.** Secrets are masked in every log, error and report; tests that change platform-wide state
  run only on request, in their own project.
- **Allure reports** grouped by epic, feature and story, with steps, links to known issues and failure screenshots.
- **QA agents** that plan, write, heal and review tests under the framework's rules in any repository that uses it
  (see [Agents](#agents)).

## Tech stack

| Tool | Use |
|---|---|
| [Playwright](https://playwright.dev) `@playwright/test` | Test runner, browser automation, API requests |
| TypeScript 7 (strict) | Language; type-checked with `tsc --noEmit` |
| [Biome](https://biomejs.dev) | Formatting, linting and the import rules between layers |
| [zod](https://zod.dev) | Validation of environment variables and data files |
| GraphQL Code Generator | Typed xAPI documents from `api/graphql/**/*.graphql` |
| swagger-typescript-api | REST types from the platform's Swagger |
| Allure 3 (`allure-playwright`) | Test reports |
| simple-git-hooks | Pre-commit check (Biome on staged files, type check) |

## Requirements

- **Node.js 22.18 or newer** (runs `.mts` files directly).
- **A Virto Commerce platform** with the modules listed in [`backend-packages.json`](backend-packages.json),
  a database and a search engine (Elasticsearch 8 locally). Give Elasticsearch at least 2 GB of memory: with 1 GB
  it runs out under parallel tests and the search-backed tests fail.
- **vc-frontend** serving the store `STORE_ID`, for the `e2e-frontend` project only.
- **The page builder shell** on the platform (`PAGE_BUILDER_PATH`), for the `e2e-backend` project only.
- A platform administrator account (`ADMIN_USERNAME` / `ADMIN_PASSWORD`).

## Getting started

### 1. Install

Bash:

```bash
git clone https://github.com/VirtoCommerce/vc-test-automation-framework.git
cd vc-test-automation-framework
npm ci
npm run install:browsers
cp .env.example .env
```

PowerShell:

```powershell
git clone https://github.com/VirtoCommerce/vc-test-automation-framework.git
Set-Location vc-test-automation-framework
npm ci
npm run install:browsers
Copy-Item .env.example .env
```

### 2. Configure `.env`

Fill in the values; every variable is validated when a run starts, and a wrong one fails with its name.

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `BACKEND_BASE_URL` | yes | | Platform origin, e.g. `http://localhost:8090` |
| `FRONTEND_BASE_URL` | yes | | Frontend origin, e.g. `https://localhost:3000` |
| `STORE_ID` | yes | | The store the dataset is seeded into and tests run against, e.g. `store-acme` |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | yes | | Platform administrator; seeds the dataset and signs in to the admin UI |
| `USERS_PASSWORD` | yes | | Password of every dataset user |
| `PAGE_BUILDER_PATH` | | `/apps/page-builder-shell/` | Path of the page builder app on the platform |
| `REQUEST_TIMEOUT_MS` | | `30000` | Timeout of one HTTP request |
| `VERIFY_SSL` | | `true` | `false` accepts self-signed HTTPS certificates (a local frontend) |
| `RUN_DESTRUCTIVE_TESTS` | | `false` | `true` enables the `isolated` project |
| `API_WORKERS` | | `4` | Parallel workers of `restapi` and `graphql` (see [Parallel workers](#parallel-workers)) |
| `FRONTEND_WORKERS` | | `3` | Parallel workers of `e2e-frontend` |
| `QUANTITY_CONTROL` | | `stepper` | The frontend's quantity control: `stepper` or `button` |
| `RANGE_FILTER_TYPE` | | `slider` | The frontend's range filter: `slider` or `default` (checkboxes) |
| `CHECKOUT_MODE` | | `single-page` | The frontend's checkout: `single-page` or `multi-step` |
| `SEED_ONLY` | | | Comma-separated dataset collections to seed instead of all |
| `GOOGLE_MAPS_API_KEY` | | | Written into the seeded store's settings |

The last three frontend settings must match how the frontend is configured; page objects adapt to them, so the
same tests run against any configuration.

An empty variable (`API_WORKERS=`) counts as unset: an optional one takes its default, a required one is reported
missing.

Variables set in the shell or on CI win over `.env`, so one run can override a value:

```bash
VERIFY_SSL=false npm run test:e2e:frontend
```

```powershell
$env:VERIFY_SSL = "false"; npm run test:e2e:frontend; Remove-Item Env:VERIFY_SSL
```

### 3. Seed the platform

```bash
npm run seed
```

The seeder writes every dataset collection to the platform as the administrator. It is safe to repeat: each
collection declares in `dataset/manifest.ts` how a repeat avoids duplicates (`repeat`). Most replace the stored
record by its id or key (`upsert`), so dataset changes reach the platform; a few whose endpoints refuse a record
twice (users, organization memberships, coupons, orders) look it up and leave it as it is (`find`). Shipping and
payment methods, whose ids the platform assigns, are found by store and code and updated in place. Dataset users
get the current `USERS_PASSWORD`, and pages get their dataset status. A collection whose module is not installed, or not in the version range the suite needs
(`dataset/modules.ts`), is skipped with a warning, such as
`[seed] WARN pages: VirtoCommerce.PageBuilderModule 3.1012.1 is older than 3.1039.0, skipped`.

The seeder does not touch the search index. After seeding a fresh platform, rebuild every document type in the
admin UI's *Search index* blade and wait until it finishes; CI does this itself.

### 4. Run the tests

| Command | Runs |
|---|---|
| `npm test` | `restapi`, `graphql`, `e2e-frontend` and `e2e-backend` |
| `npm run test:restapi` | REST API tests |
| `npm run test:graphql` | xAPI (GraphQL) tests |
| `npm run test:e2e` | Both browser projects |
| `npm run test:e2e:frontend` | Frontend browser tests |
| `npm run test:e2e:backend` | Page builder (admin UI) browser tests |
| `npm run test:unit` | Unit tests of the framework itself; no platform needed |
| `npm run test:isolated` | Destructive tests; needs `RUN_DESTRUCTIVE_TESTS=true` (see below) |

Any Playwright option can be added after `--`:

```bash
npm run test:graphql -- tests/graphql/cart              # one folder
npm run test:restapi -- -g "rename a channel"            # by title
npm run test:e2e:frontend -- --headed --workers=1        # watch the browser
npm run test:graphql -- --repeat-each=5 tests/graphql/pickup   # hunt for flakiness
```

Use the npm scripts rather than a bare `npx playwright test`: without `--project` Playwright also runs the `seed`
and `unit` projects.

#### Parallel workers

Playwright starts several worker processes and hands them tests one by one. With `fullyParallel` on, any two tests
may run at the same time, even two tests of one file, and in any order. A worker runs one test at a time.

**How many workers each project gets:**

| Projects | Workers | Why |
|---|---|---|
| `restapi`, `graphql` | `API_WORKERS` (default 4) | Each worker sends requests non-stop; the platform's database and search engine take the load |
| `e2e-frontend` | `FRONTEND_WORKERS` (default 3) | Each worker runs a Chrome and loads the frontend; the frontend and the machine take the load |
| `e2e-backend` | 1 | The page builder's page list is shared: pages created in parallel hide each other from its search |
| `isolated` | 1 | Destructive tests must never overlap |
| `unit`, `seed` | Playwright's default (half the CPU cores) | No platform load (`unit`) or one test (`seed`) |

Raise `API_WORKERS` on a strong platform for faster runs; lower it when search-backed tests time out, typically on
a local Elasticsearch with little memory. `--workers=N` on the command line, or the CI `workers` input, overrides
every project for one run. Within one run, the projects' tests interleave, each project held to its own count;
`npm test` therefore runs API and browser tests at the same time. CI runs each suite as its own Playwright run, one
after another.

**What a worker shares between its tests, and what each test gets new:**

| Lives for | Fixtures | What it means for tests |
|---|---|---|
| The worker | `env`, `dataset`, `store`; the `api` request context and its token cache; the browser sign-in sessions | Each user signs in once per worker and the token is reused, so tests don't pay a sign-in each. Tokens are revoked when the worker ends. |
| The test | `api` (the session), `arrange`, `cleanup`, `shopper`, `page`, `frontend`, `pageBuilder` | A new undo stack, a new browser context with its own storage, and for an anonymous session a new user id, so no two tests share a cart. |

**Why tests don't collide:**

- **Seeded data is read-only.** Every worker reads the same dataset records; no test changes them. A test that needs
  to change something creates its own: `arrange` gives every record a unique name (`uniqueId`, e.g.
  `test-pricelist-3f9a1c2e`) and, where the platform accepts it, a random id.
- **Customers of their own.** A test that changes a customer's cart, lists, addresses or locks creates its own
  customer (`arrange.customers.customerAccount()`, or `test.use({ shopperKind: "customer" })` in e2e), instead of
  sharing a dataset user with tests in other workers.
- **Assertions look at the test's own records.** Search and list checks pick out the ids or names the test created
  (`expect(found.map(({ id }) => id)).toContain(created.id)`); they never assume the platform holds nothing else,
  because other workers are creating records at the same moment. Counting all records is avoided for the same reason.
- **Cleanup per test.** Each test removes what it created when it ends, so the platform does not fill up during a
  run, and a failed test does not leave data that breaks another one.

**When tests must not run in parallel:**

- Tests that change platform-wide state go to `tests/isolated/` (one worker, own run).
- Tests that share one platform-wide counter or list that others change can run in file order with
  `test.describe.configure({ mode: "default" })`; `restapi/content/files.spec.ts` does this for the content
  statistic. This orders tests within the file only; other files still run alongside.
- The page builder's page list is shared, so `e2e-backend` runs with one worker.

**No retries.** A failed test is not retried, on CI or locally, and neither is a failed request (a database
deadlock included): an intermittent failure fails the run, so its cause gets found instead of hidden. The one
exception is the sign-in: `TokenClient` repeats a `/connect/token` 500, which the platform answers to concurrent
sign-ins of one user. To hunt for a flaky test, use `--repeat-each=5` on its file.

### 5. Read the report

```bash
npm run report        # builds allure-report/ from allure-results/
npm run report:open   # opens it
```

`allure-results/` keeps growing across runs; delete it for a report of one run only.

A failed test keeps its Playwright trace (`trace: "retain-on-failure"`). Open it from the Allure
report's attachments, or locally:

```bash
npx playwright show-trace test-results/<test folder>/trace.zip
```

Browser traces hold every action, DOM snapshot, console message and network request. API traces hold the steps and
every REST and GraphQL call of the test, from the sign-in and `arrange` through the test to cleanup, with headers,
bodies, status and timing (the trace viewer's *Network* tab); browser traces hold these calls too. A sign-in reused
from an earlier test of the worker sends nothing, so it is not in the trace. A failed seed's trace holds every call
too; CI runs the seed without the Allure reporter, so its trace is in the artifact's `test-results/seed/`.

Traces are not masked: they hold tokens, cookies and typed passwords. Use only throwaway credentials on a temporary
platform, as CI does, and share traces only where the `.env` values may be seen.

### Destructive tests

`tests/isolated` holds tests that change platform-wide state other tests depend on: they restart the platform,
reload modules, drop and rebuild the product index, close the store to anonymous users, and change global
settings. They run only when asked for, with one worker, on a platform nobody else is testing on:

```bash
RUN_DESTRUCTIVE_TESTS=true npm run test:isolated
```

```powershell
$env:RUN_DESTRUCTIVE_TESTS = "true"; npm run test:isolated; Remove-Item Env:RUN_DESTRUCTIVE_TESTS
```

Without the flag the `isolated` project does not exist, so it can never run by accident.

## CI

[`.github/workflows/auto-tests.yml`](.github/workflows/auto-tests.yml) runs on demand (*Actions → Auto Tests
Docker → Run workflow*) through the shared
[`VirtoCommerce/.github` Playwright workflow](https://github.com/VirtoCommerce/.github). For each database and
search engine in its matrix it:

1. deploys the platform in Docker with the modules of `backend-packages.json`, and the frontend;
2. writes `.env` from the `VC_TESTING_MODULE_ENV_FILE_NEW` secret (it must hold `STORE_ID` and `USERS_PASSWORD`;
   the URLs and the administrator are filled in by the workflow);
3. runs `npm ci`, installs the browsers, runs the `seed` project and rebuilds the search indexes;
4. runs each selected suite as its own Playwright run, so one failing suite does not stop the next;
5. uploads the JUnit, JSON and Allure reports as artifacts.

Inputs: the frontend build (`frontendZipUrl`), the suites (`all` = `graphql`, `restapi`, `e2e`; or one of them;
`isolated` also needs `RUN_DESTRUCTIVE_TESTS=true` in the secret), an optional `--grep` and `--workers`.

To test new module versions, update `backend-packages.json`.

### Database differences

CI runs every suite on PostgreSQL, SQL Server and MySQL. Where the platform behaves differently per database, the
test asserts what holds on all three and carries a `database difference` annotation that says how (search the specs
for it, or see it in the report):

| Behaviour | PostgreSQL | SQL Server, MySQL | How the test copes | Spec |
|---|---|---|---|---|
| Pickup location keyword search | Matches the name only | Also matches the address, ignoring case | Expects every location named with the keyword, and every result to mention it in its name or address, in any case | `graphql/pickup/pickup-locations.spec.ts` |
| Name of the database health check | `PostgreSql health` | `SQL Server health`, `MySql health` | Matches any of the three names | `restapi/platform/health.spec.ts` |

When a test fails on only one database, check whether the platform differs there before calling it a defect. If
it does, make the assertion hold on every database, annotate the test and add a row here:

```ts
test("filter pickup locations by keyword", {
  annotation: {
    type: "database difference",
    description: "PostgreSQL matches names only; SQL Server and MySQL also match the address, ignoring case.",
  },
}, async ({ api, dataset }) => {
```

## Project structure

The code is in layers. Each layer may import only the layers before it; Biome enforces this
(`biome/layers.json`), and specs import Playwright only through `@fixtures`.

```
core  →  api  →  dataset  →  fixtures  →  tests
                   pages ─────────┘
```

| Alias | Folder |
|---|---|
| `@core/*` | `core/` |
| `@api/*` | `api/` |
| `@dataset/*` | `dataset/` |
| `@pages/*` | `pages/` |
| `@fixtures` | `fixtures/index.ts` |

```
.
├── core/                    Helpers with no platform knowledge
│   ├── env.ts               Reads and validates .env into the frozen `Env` (the `env` fixture)
│   ├── secret.ts            `Secret`: a value masked in every log, error and report
│   ├── cleanup-stack.ts     Runs registered undo actions in reverse order, collecting every failure
│   ├── poll.ts              `pollUntil` and `INDEX_LAG_TIMEOUT_MS` for eventually consistent reads
│   ├── required-fields.ts   `requireFields` / `requireDefined`: narrow optional API fields or fail clearly
│   ├── unique-id.ts         Unique names for test data
│   ├── modules.ts           Module requirements with version ranges, and why an installed module set misses one
│   └── …                    Logger, validation schemas, deep freeze, topological sort, placeholders
│
├── api/                     Talking to the platform
│   ├── api-session.ts       `ApiSession`: one user's REST + GraphQL clients (the `api` fixture)
│   ├── api-matchers.ts      `toBeHttpError`, `toBeGraphqlError`, `toHaveConsistentTotals`
│   ├── mailbox.ts           Reads sent e-mails from the platform's notification journal
│   ├── auth/                Token endpoint, token cache, browser sign-in state (cookie / local storage)
│   ├── http/                `HttpClient`, `HttpResponse`, `HttpError`
│   ├── rest/
│   │   ├── rest-api.ts      `RestApi`: every REST client, e.g. `api.rest.catalog.products`
│   │   ├── clients/         One client per platform module
│   │   ├── types/           Named types over the generated ones, with the fields tests rely on made required
│   │   └── generated/       Generated from Swagger (`npm run codegen:rest`); never edit
│   └── graphql/
│       ├── graphql-client.ts  Executes typed documents; throws `GraphqlError` on errors
│       ├── fragments/, operations/  The .graphql documents tests use
│       └── generated/       Generated from the schema (`npm run codegen:graphql`); never edit
│
├── dataset/                 Test data
│   ├── data/                The seed dataset as JSON, one folder per collection
│   ├── manifest.ts          How each collection is seeded: endpoint, keys, module, order
│   ├── modules.ts           `MODULES`: the platform modules (and version ranges) the seed and the tests need
│   ├── dataset.ts           Typed access for tests: `dataset.products.get(id)`, `dataset.users.filter(…)`
│   ├── seed/                The seeder and the steps after it (user passwords, page statuses)
│   ├── builders/            `newX()` functions that build unique entities for tests
│   ├── arrange/             The `arrange` fixture, one file per domain (see below)
│   └── users.ts, stock.ts, store-under-test.ts   Dataset lookups: credentials, fulfillment centers, the store
│
├── pages/                   Page objects (depend on `core` only)
│   ├── selectors.ts         Shared selector helpers; `responses.ts`: wait for the response an action causes
│   ├── frontend/            vc-frontend
│   │   ├── frontend.ts      `Frontend` factory (the `frontend` fixture)
│   │   ├── layouts/         `MainLayout`: top header and cart badge, the base of every page
│   │   ├── ui-kit/          Wrappers of the vc-frontend UI kit (quantity control, widget, dropdown filter, …)
│   │   ├── components/      Parts of pages, one area per file or folder (header, address, catalog, checkout, …)
│   │   ├── pages/           One page per file, by area (site, catalog, cart, checkout, account, lists)
│   │   └── flows/           Journeys over several pages (`CheckoutFlow`)
│   └── backend/             Admin UI
│       ├── vc-shell/        Wrappers of the vc-shell UI kit (blade, data grid, select, date picker, switch, …)
│       └── page-builder/    The page builder app: routes, list and details blades, `PageBuilderShell`
│
├── fixtures/                Playwright fixtures; specs import `test`, `expect`, `knownIssue` and `KNOWN_ISSUES` from `@fixtures`
│   ├── env.fixture.ts       `env`
│   ├── dataset.fixture.ts   `dataset`, `store`
│   ├── api.fixture.ts       `api` (anonymous by default; `test.use({ user })` signs in a dataset user), `requiresModules`
│   ├── cleanup.fixture.ts   `cleanup` (the stack `arrange` registers on); reports errors known issues explain
│   ├── arrange.fixture.ts   `arrange`
│   ├── browser.fixture.ts   `shopper`, `frontend`, `pageBuilder`; signs the browser in
│   └── known-issue.ts       Reads `known-issues.json`; `knownIssue(...)`, `tests` and `failure` matching, the report entries
│
├── tests/
│   ├── setup/               The `modules` and `seed` setup projects
│   ├── restapi/             REST tests, one folder per platform module
│   ├── graphql/             xAPI tests, by area (cart, catalog, customer, orders, pickup, quotes, security)
│   ├── e2e/frontend/        Frontend tests (account, cart, catalog, checkout, lists, site)
│   ├── e2e/backend/         Page builder tests
│   ├── isolated/            Destructive tests (see above)
│   └── unit/                Unit tests of core, api and dataset, against local stub servers
│
├── biome/                   Lint rules, import rules, layer rules, exceptions
├── .claude/                 The QA agents, skills, commands and the read-only shell hook (see Agents)
│   └── checks/              Scripts that check the agents' work without a model; import only `.claude/checks/` and `core/`
├── .qa/                     `project.json` (committed) and the agents' git-ignored working folders
├── known-issues.json        Known defects of the platform under test, with links to their tickets
├── playwright.config.ts     Projects, timeouts, reporters
├── codegen-graphql.ts, codegen-rest.mts   Code generation
├── backend-packages.json    Platform and module versions CI deploys
├── REFINEMENTS.md           Planned refinements and what is left of the old suite's migration
└── .github/workflows/       CI
```

### Playwright projects

| Project | Folder | Notes |
|---|---|---|
| `unit` | `tests/unit` | No platform needed |
| `modules` | `tests/setup` | Reads the platform's installed modules once per run, for `requiresModules` and the seed; every project but `unit` depends on it |
| `seed` | `tests/setup` | Seeds the dataset |
| `restapi` | `tests/restapi` | `API_WORKERS` workers, 90 s per test |
| `graphql` | `tests/graphql` | `API_WORKERS` workers, 90 s per test |
| `e2e-frontend` | `tests/e2e/frontend` | Chrome 1920×1080, `FRONTEND_WORKERS` workers, 120 s per test |
| `e2e-backend` | `tests/e2e/backend` | One worker (the page list is shared), 120 s per test |
| `isolated` | `tests/isolated` | Only with `RUN_DESTRUCTIVE_TESTS=true`; one worker |

### Fixtures

| Fixture | What it is |
|---|---|
| `env` | The validated configuration |
| `dataset`, `store` | The seed dataset; the store under test (id, catalog, language, currency) |
| `api` | An `ApiSession`: `api.rest.*`, `api.graphql.execute(...)`, `api.storeContext()`, `api.as(user)`, `api.anonymous()` |
| `requiresModules` | Option: platform modules a test needs, from `MODULES`; where one is missing or outside its version range the test is skipped, with the reason |
| `arrange` | Creates test data and removes it after the test |
| `cleanup` | The cleanup stack, for undoing what the code under test creates |
| `shopper` | The frontend browser's identity and its `api` session (`test.use({ shopperKind: "customer" })`) |
| `frontend` | Frontend page objects, e.g. `frontend.cart()`, `frontend.category("smartphones")` |
| `pageBuilder` | The page builder app of the admin UI |

### `arrange` domains

| Domain | Creates |
|---|---|
| `arrange.customers` | Organizations, members, signed-in customers (`customerAccount()`), memberships, addresses |
| `arrange.security` | Back-office users, API keys, roles, OAuth apps, signed-in sessions |
| `arrange.catalog` | Catalogs, categories, products, tags, product configurations, completeness channels |
| `arrange.pricing` | Pricelists, prices, assignments |
| `arrange.marketing` | Promotions, dynamic content |
| `arrange.orders` | Orders, quotes |
| `arrange.carts` | Carts and shopping lists, in a shopper's session |
| `arrange.pickup` | Pickup locations, and waits until carts and products can be picked up there |
| `arrange.content` | Assets, content files, menus, page builder pages |
| `arrange.platform` | Stores, store and global settings, dictionaries, dynamic properties, white-labeling |

Methods named `…Later` create nothing: they register the removal of something the code under test will create.
`arrange.admin` is the store administrator's session, for reading platform state in assertions.

## Writing tests

### Rules

The framework rules (spec structure, layers and imports, data and cleanup, waits, assertions, known defects, optional
modules, working discipline) live in one place, the `framework-rules` skill:
[`.claude/skills/framework-rules/SKILL.md`](.claude/skills/framework-rules/SKILL.md). They are the same in every
repository that uses the framework, and the agents read that skill first. Read it before writing or reviewing a test;
this guide does not repeat it. `CLAUDE.md` keeps only what a client may replace with its own: code style, naming and
wording. A framework rule beats a style rule, and in a client repository the client's style beats ours.

What the skill leaves to this guide is how the pieces behind the rules work.

- The installed modules are read once per run, by the `modules` setup project, which every project but `unit`
  depends on: it saves them to `test-results/installed-modules.json` and logs how many there are; the seed and
  `requiresModules` read that file, so no worker signs in to check modules.
- Module requirements live in one place, `MODULES` in `dataset/modules.ts`, shared by the seed manifest and the
  tests, so a collection the seed skips and the tests that use its data skip for the same reason. A requirement
  may carry a version range: `minVersion` (inclusive) when the suite relies on a fix or feature of that version,
  `beforeVersion` (exclusive) when a later version changes what a test checks. The range is what the suite is
  proven on: raise `minVersion` when the suite starts relying on a newer fix, lower it only after a green run on
  the older version. The suite targets edge versions; version ranges are for the few modules it deliberately
  follows at edge (today PageBuilder), not for general differences between stable and edge bundles.
- Known defects are listed in `known-issues.json` in the repository root, by name:

  ```json
  {
    "channelSearchIgnoresFilters": {
      "issueUrl": "https://virtocommerce.atlassian.net/browse/VCST-6441",
      "summary": "POST /api/completeness/channels/search ignores objectIds and keyword"
    }
  }
  ```

  `summary` is required. With an `issueUrl` a marked test runs and is expected to fail; without one it is
  skipped as `fixme`. The file is validated when tests start: an unknown field, a blank summary or an invalid
  pattern stops the run with the entry's name.
- A test marks itself with `await knownIssue(KNOWN_ISSUES.x)`, first in the test. `KNOWN_ISSUES` has the names
  the framework's specs use (`KNOWN_ISSUE_NAMES` in `fixtures/known-issue.ts`); a name the file does not list is
  `undefined` and the mark does nothing.
- `tests` marks tests without changing them: patterns over `<spec file> › <describe> › <test>`, where `*`
  matches any text, such as `"tests/restapi/security/oauth-apps.spec.ts › *"` for a whole file or
  `"* › search OAuth apps by keyword"` for one test.
- A defect that can hit any test, such as a deadlock between parallel deletes, gets a `failure` pattern instead:
  a regular expression over an error it causes (request, status, body), written as a JSON string, so backslashes
  are doubled (`"DELETE \\S+/api/contacts"`). A test whose every error, in its steps or its cleanup, matches a
  tracked issue's `failure` is reported as an expected failure of that issue; any other error still fails it.
- Every known issue a test hits shows in the report as a link to the ticket, a `known issue` tag (Allure lists an
  expected failure as passed, so filter by the tag), a "Known issue <label>" attachment saying what failed, and a
  `[known issue] WARN <label>: <summary> (<link>) in "<test>"` line in the run's log. The label is the last part
  of the `issueUrl`, such as `VCST-6441`.
- A platform with its own modules or frontend has its own defects: its CI puts its own `known-issues.json` in the
  repository root in place of ours. Issues of ours it leaves out are not marked there, and its own issues reach
  the framework's tests through `tests` and `failure`.

Before committing, run `npm run check` (format and lint) and `npm run typecheck`; the pre-commit hook runs both.

### A REST test

```ts
import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Pricing / Pricelists");
});

test.describe("pricelists (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("rename a pricelist", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("A renamed pricelist is read back with its new name.");
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    const newName = `${pricelist.name}-renamed`;

    await test.step("act: rename the pricelist", () =>
      api.rest.pricing.pricelists.update({ ...pricelist, name: newName }));

    await test.step("assert: the pricelist has the new name", async () => {
      expect((await api.rest.pricing.pricelists.get(pricelist.id)).name).toBe(newName);
    });
  });
});
```

- `test.use({ user })` signs `api` in as a dataset user; without it `api` is anonymous.
- Missing records: `find(id)` returns `undefined`; `get(id)` throws (with the record name in the message), so use `find` to
  check that something is gone.
- Expected rejections: `await expect(promise).rejects.toBeHttpError(400, "reason in the body")`.
- An endpoint without a client: add a method to its client in `api/rest/clients/`, with types from
  `api/rest/types/`. Regenerate the types with `npm run codegen:rest` after a platform update.

### A GraphQL test

```ts
import * as allure from "allure-js-commons";

import { AddItemsCartDocument } from "@api/graphql/generated/graphql";
import { expect, test } from "@fixtures";

const PRODUCT_ID = "product-smartphone-samsung-galaxy-a57-5g";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Cart / Items");
});

test.describe("cart items (anonymous)", () => {
  test("add a product to a new cart", async ({ api, arrange }) => {
    await allure.story("Add");
    await allure.description("A product added to a new cart is its only line item.");
    arrange.carts.removeDefaultCartLater(api);

    const { addItemsCart } = await test.step("act: add the product ×1", async () =>
      api.graphql.execute(AddItemsCartDocument, {
        command: { ...(await api.storeContext()), cartItems: [{ productId: PRODUCT_ID, quantity: 1 }] },
      }));

    await test.step("assert: the cart holds the product ×1", () => {
      expect(addItemsCart?.items?.map((item) => [item?.productId, item?.quantity])).toEqual([[PRODUCT_ID, 1]]);
    });
  });
});
```

- `api.storeContext()` gives the variables every xAPI operation needs: store, culture, currency and user id. An
  anonymous session gets a fresh user id, so anonymous tests never share a cart.
- A customer of the test's own: `const customer = await arrange.customers.customerAccount()`, then `customer.api`.
- A new operation: add a `.graphql` file under `api/graphql/operations/<area>/` (reuse `fragments/`), then run
  `npm run codegen:graphql` to get its typed `…Document`.
- `execute` throws `GraphqlError` when the response has errors; assert expected errors with
  `rejects.toBeGraphqlError("VALIDATION")`, or read them with `executeRaw`.

### An e2e test

```ts
import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

const PRODUCT = { id: "product-smartphone-samsung-galaxy-a57-5g", sku: "smartphone-samsung-galaxy-a57-5g" } as const;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Cart");
});

test.describe("cart (customer of their own)", () => {
  test.use({ shopperKind: "customer" });

  test("change the quantity of a line item", async ({ frontend, shopper, arrange }) => {
    await allure.story("Line items");
    await allure.description("A line item's quantity changed in the cart is what the cart badge shows.");
    await test.step("arrange: the cart holds the product ×3", () =>
      arrange.carts.defaultCart(shopper.api, [{ productId: PRODUCT.id, quantity: 3 }]));
    const cart = frontend.cart();
    const { quantity } = cart.lineItem(PRODUCT.sku);

    await test.step("arrange: open the cart", async () => {
      await cart.navigate();
      await expect(quantity.input).toHaveValue("3");
    });

    await test.step("act: set the quantity to 4", () => quantity.setQuantity(4));

    await test.step("assert: the cart badge shows 4", async () => {
      await expect(cart.cartQuantityLabel).toHaveText("4");
    });
  });
});
```

- The browser starts signed in: as an anonymous visitor (default) or as a new customer
  (`test.use({ shopperKind: "customer" })`). Arrange the shopper's data through `shopper.api`, the same identity.
- `frontend` builds page objects for the configured frontend: `setQuantity` uses the stepper or the add-to-cart
  input as `QUANTITY_CONTROL` says, and `frontend.checkout()` walks the single-page or multi-step checkout.
- Specs hold no selectors. Add locators and multi-step actions to `pages/`; a page object exposes `Locator`s for
  assertions and methods that wait for what they trigger.
- UI-kit classes (`.vc-*`) appear only in `frontend/ui-kit/` and `backend/vc-shell/`, so a change in either kit is
  fixed in one place. Components and pages use `data-test-id`s and these wrappers.
- Locate by test id with `getByTestId("…")`: the config sets `testIdAttribute` to the frontend's `data-test-id`
  (Playwright's default is `data-testid`). A prefix match takes a pattern: `getByTestId(/^filter-price-/)`.
- Page builder tests use the `pageBuilder` fixture; the browser is signed in to the admin UI as the administrator.

### Cleaning up

Every test gets a `CleanupStack` (`core/cleanup-stack.ts`) as the `cleanup` fixture. A test, or `arrange` on its
behalf, pushes an undo action for each change; after the test the fixture runs them all.

- **When:** after the test body, whether it passed or failed (it is fixture teardown), while the `api` session is
  still signed in.
- **Order:** last registered first (LIFO), so dependants go before what they depend on: a membership before its
  organization, a user before its contact, a price before its pricelist.
- **Failures:** a failing undo does not stop the others. When all have run, the test fails with
  `"<n> cleanup action(s) failed"` and one line per failure, secrets masked, so leftover data never goes unnoticed.
- **Report:** each undo is an Allure step `cleanup: <description>`.

`arrange` registers the undo of everything it creates, and its `…Later` methods register undos for what the code
under test creates. Use `cleanup` directly only when a test creates or changes something `arrange` has no method
for:

```ts
test("create a catalog", async ({ api, cleanup, store }) => {
  const draft = newCatalog(store.defaultLanguage);
  cleanup.push(`delete catalog ${draft.name}`, () => api.rest.catalog.catalogs.delete(draft.id));

  const catalog = await test.step("act: create the catalog", () => api.rest.catalog.catalogs.create(draft));

  await test.step("assert: the catalog has the given id", () => {
    expect(catalog.id).toBe(draft.id);
  });
});
```

Rules for undo actions:

- **Push before the change.** If the change fails halfway, or the assertion after it fails, the undo still runs.
  For that the id must be known up front: builders set `id: randomUUID()`, which the platform keeps for most
  entities. Where the platform assigns the id (page builder pages, GraphQL carts and lists), push right after the
  create, before any assertion. When the change follows right away, as in `arrange`, register both in one call so
  the order cannot be swapped: `return cleanup.track(description, undo, () => client.create(draft))`.
- **Make the undo tolerant.** It may run when the change never happened or the test already deleted the record:
  most platform deletes by id ignore a missing id; where one does not, check first, as the shopping list undo does.
- **Undo what was changed, not just what was created.** A changed setting is restored to its old value
  (`arrange.platform.setting`, `storeSetting`); a renamed folder is deleted under its new name.
- **Describe it** in a few words with the record's name or id: the description is the report step and the
  failure message.

### Adding seed data

Add a JSON file to the collection's folder in `dataset/data/` (ids are prefixed with the collection, e.g.
`product-…`), reference it from tests by id, and run `npm run seed`. A new collection in `dataset/manifest.ts`
must say how a repeated seed avoids duplicates: `repeat: "upsert"` when its endpoint replaces a record by id or key
(prove it by seeding twice), or `repeat: "find"` with a `find` path when the endpoint refuses a record twice; for
records whose id the platform assigns, `storedIdFrom` finds the stored one by a search. `${ENV:NAME}` placeholders take values from
`.env`. Tests read seeded records through `dataset`, so data and expectations never drift apart.

## Agents

The repository ships seven Claude Code agents, the skills they read and the commands that run them (`.claude/`),
plus small scripts that check their work without a model (`.claude/checks/`). The agents carry no facts about a particular stand:
what differs between repositories (commands, data roles, the tracker, critical flows) comes from
`.qa/project.json`, and style comes from the repository's `CLAUDE.md`. The same files are meant to work in a client's
test repository unchanged. Running them needs Node 22.18 or newer, because the `.claude/checks/` scripts are TypeScript files that
Node runs directly.

### Roles

| Agent | Does | Limits |
|---|---|---|
| `qa-planner` | Turns a ticket, a specification, an area of existing functionality or a coverage gap into a case matrix and writes the contract; asks the scope questions the matrix leaves open | Writes no test code |
| `qa-automation-expert` | Implements the approved contract and nothing else, runs the definition of done and leaves a run record | Receives only the contract path; on a change of scope it stops and writes an amendment request |
| `qa-explorer` | Maps an unfamiliar frontend area (pages, selectors, missing test ids, a page-object proposal) or API area (schema against the live answers) and writes a report | Read-only shell; writes only `.qa/reports/explore-<slug>.md`; writes no test code |
| `qa-healer` | Re-runs failing or flaky tests, classifies each failure (test defect, product defect, stand data, flaky), fixes test-side defects, at most three rounds | Edits only the directories in `healerPaths`, never a spec; never moves an expected value or assertion toward the build |
| `qa-judge` | Judges the expert's tests in a flow: every contract case has a test, each test checks what its case claims, each fails when the behaviour breaks (proved by a script on a throw-away copy), every skip has a reason | Read-only shell; writes only `.qa/judge/<contract-name>/*.json`; fails when in doubt |
| `qa-reviewer` | Checks a diff against the framework rules, the repository's style, that nothing is left on a shared stand and the definition of done | Starts fresh with the diff and the contract path; reports, never fixes; read-only shell |
| `qa-coverage` | Lists what the stand offers and what the tests cover, ranks the gaps by script with the project's weights and critical flows | Read-only; writes only `.qa/reports/coverage-<date>[-<slug>].md` |

Agents never commit, push or write to a tracker, wiki or code host, and change no state on a shared stand outside
what the repository's cleanup and `tests/isolated/` rules allow. A subagent cannot start another one, so the commands
below orchestrate, and every role runs as a fresh subagent that is handed file paths, not another agent's summary.

The skills behind them: `framework-rules` (read first by every agent), `project-facts`, `read-ticket` and
`read-change` (the only places that know tracker and code-host access routes), `plan-test-strategy`,
`plan-implementation`, the `write-*` and `create-*` skills, `explore-frontend`, `explore-api`, `heal-tests`,
`coverage-analysis`, `judge-criteria`, `review-test-code`, `review-pr` and `write-security-test` (access without a
session, the wrong role, one customer reaching another's objects, response headers, input validation). The
`migrate-katalon-module` skill and the `/code-review-full` command belong to this repository only
(`.claude/checks/ours-only.json`).

### Commands

`/qa <task>` is the entry: it picks a flow, dispatches the roles in order and ends with what ran and what waits for a
person. The other commands run one stage.

| Request to `/qa` | Flow |
|---|---|
| A ticket, specification or feature | planner, approval, expert, judge, reviewer |
| An area with no ticket ("cover the cart"), or a gap from coverage | explorer and coverage, then planner, approval, expert, judge, reviewer |
| "Explore ..." | explorer |
| A failing or flaky test | healer, the expectation guard, then reviewer when code changed |
| "Review this branch" | reviewer |
| "What is not covered" | coverage |
| "Do it end to end" | planner, approval, explorer if needed, expert, healer if red, guard, judge, reviewer |

Shortcuts: `/qa-plan`, `/qa-implement`, `/qa-review`, `/qa-explore`, `/qa-heal` and `/qa-coverage`. A person approves
the contract with one question before the expert starts; the command never approves for them. A failed judge verdict
sends the tests back to the expert once, and a second failure goes to a person. After the healer, a code check
(`.claude/checks/expectation-guard.mts`) confirms that its diff changed no expectation and added no skip. End to end, a red
expert run goes to the healer before the judge, and after a clean guard the command re-runs the stable series into
the run record, so the reviewer reconciles the healed state. `/qa-implement` ends by naming
`/qa-review <contract path>`, which passes the contract to the reviewer. The reviewer's shell
cannot run typecheck or lint, so the command runs `commands.typecheck` and `commands.lint` itself, and the work is not
done while either fails.

### The `.qa/` folder

| Path | Holds | In git |
|---|---|---|
| `.qa/project.json` | The facts of this repository (below) | Committed |
| `.qa/contracts/<ticket-key-or-slug>.md` | The contract: source, scope, case matrix, stand needs, building blocks, known issues, verification. The only hand-off from planning to implementation | Ignored |
| `.qa/runs/<contract-name>/` | The expert's Playwright JSON report and `--list` output, `report.<project>.json` and `list.<project>.json` for each project (named with the project even when there is one), and the reviewer's `review-list.<project>.json`; the healer's runs go to `.qa/runs/heal-<slug>/` | Ignored |
| `.qa/reports/` | `explore-<slug>.md`, `coverage-<date>[-<slug>].md`, the healer's `heal-<slug>.md` and `flaky.md` | Ignored |
| `.qa/judge/<contract-name>/` | The verdict, `judge-expert.json`; before the first expert dispatch of a run the command renames an earlier one to `judge-expert.previous.json` | Ignored |
| `.qa/kb/` | The knowledge snapshot (`knowledgeDir`): ticket cards, change records and documentation the agents fetched, each with its capture date. Agents read it before calling a live service | Ignored here, because it fills with internal ticket text; a private client repository may commit it |

`<contract-name>` is the contract's file name without `.md`, so it equals the `<ticket-key-or-slug>` of
`.qa/contracts/<ticket-key-or-slug>.md`. It is the one term the agents, skills, commands and this guide use for the
folder of a contract's run record and verdict; the skill `project-facts` ("Hand-off Paths") holds these names in one
place. A contract holds one row per case (case, technique, Playwright project, data
role, oracle) and every oracle names its source: `ticket`, `doc`, `schema` or `observed`. A case whose expectation is
only `observed` may encode a bug the stand already has, so a person confirms it at approval or it is written as a
characterization test. An amendment written during implementation counts only with an `Approved: <who>, <date>` line;
`node .claude/checks/contract.mts check <file>` fails otherwise.

**Git-ignore the working folders in a client repository.** Add `.qa/contracts/`, `.qa/runs/`, `.qa/reports/`,
`.qa/judge/` and `.qa/kb/` (leave the last out only when the repository is private and the snapshot is meant to be
shared) to `.gitignore`, and commit only `.qa/project.json`. The expectation guard compares the working tree before
and after the healer and leaves ignored files out. If the healer's own reports and run records were not ignored, each
of them would count as a change outside `healerPaths`.

### `project.json`

Read through `node .claude/checks/project-facts.mts` by the `project-facts` skill. Every field is required unless marked
optional. A missing, unreadable or invalid file stops the agents with a line that names the field
(`project.json: commands.typecheck is missing`); they never fall back to another repository's values.

| Field | Meaning |
|---|---|
| `tracker.kind`, `tracker.keyPattern` | The tracker's name and the regular expression a ticket key must match |
| `tracker.acceptanceCriteriaField` (optional) | Where the tracker keeps acceptance criteria, when not in the description |
| `tracker.routes` (optional) | Allowed ways to read a ticket, in order. Absent means pasted text only |
| `docSources` | List of `{ name, route, where }`: the documentation the planner may read, and how |
| `commands.typecheck`, `commands.lint` | Commands that must be clean before the work is done |
| `commands.test` | Map from Playwright project name to the command that runs it |
| `critical` | Names of critical flows; a gap in one ranks above all others. May be empty |
| `knowledgeDir` | Directory of the knowledge snapshot |
| `roles` | Map from data role ("store administrator") to the account `test.use({ user })` takes. Plans and reports name roles, never accounts |
| `roleFor` | Map from a fixed purpose to a key of `roles`: `admin` (the role `arrange` and REST administration tests act as), `customer` (an ordinary signed-in customer account), `otherCustomer` (a customer of another organization, for access tests). All three are required. Ours: `admin` is "store administrator", `customer` "store employee", `otherCustomer` "other store employee" |
| `rolePermissions` (optional) | Map from a key of `roles` to the full list of permission names that role holds, written exactly as the platform under test names them. A case that needs "a role with (or without) permission P" picks its role here; when the field is absent or does not settle it, the planner asks. Ours lists only what the seed in `dataset/data/roles/` and `dataset/data/users/` shows; the store administrator is left out because its user is also a platform administrator |
| `coverageWeights` | `risk`, `callFrequency`, `runFrequency`, `stability`, `cost`: numbers of at least 0 |
| `flakyRunSeries` | Repetitions that decide "flaky": an integer of at least 2 |
| `quality.maxSteps`, `quality.maxLines`, `quality.maxExpects`, `quality.maxNesting`, `quality.maxConditionals` | Shape limits of one test, checked by `node .claude/checks/test-shape.mts <spec>…`: `test.step` calls, lines of the `test(...)` call, `expect` calls, depth of blocks in its body, and `if`, `?:`, `switch` and condition-driven loops (`for … of` over a table is not one). Integers; `maxLines` at least 1. A test over a limit is a Critical finding of the reviewer |
| `quality.stableSeries` | Repetitions a new or changed test must pass in a row (`--repeat-each=<n> --retries=0`, judged by the run record like any run): an integer of at least 2. Separate from `flakyRunSeries`, which decides "flaky" for the healer |
| `quality.durationBudgetMs` | Map from Playwright project to the most milliseconds a test of it may take (the median of its repetitions). A project absent from the map has no budget. Checked by `node .claude/checks/test-duration.mts <report.json> <project> [<previous report.json>]` |
| `quality.slowdownRatio` | A test is a finding when its median duration is more than this many times its median in the previous report (a number of at least 1; applies to every project when a previous report is given) |
| `quality.slowdownMinMs` | A test is compared with the previous report only when its previous median is at least this many milliseconds, so jitter on a fast test is no slowdown: an integer of at least 0 (0 compares every test) |
| `autonomy` | Map from area to `apply` or `propose`; `"*"` is required and is the default. `propose` means the healer writes the fix into its report and waits |
| `healerPaths` | Plain directories the healer may change, such as `pages/` or `dataset/`. Never the repository root, `qa`, `.qa`, `.claude`, `node_modules` or a name that starts with `.git` |

The routes are `command` (the framework's own tracker command, once it exists), `cli` (the provider's command line),
`api` (the provider's REST API), `mcp` (the provider's MCP server) and `paste`. The first route that answers is used,
and whatever the route, `read-ticket` writes the same ticket card, so the other agents never see the difference. Text
that arrives over `mcp` reaches the model unmasked, which is why a client's default allows only `paste` until it turns
the others on.

### Setting up in a repository

1. Copy the tracked files of `.claude/` (the check scripts in `.claude/checks/` included; never a git-ignored
   `*.local.*` file) and `.qa/project.json`, then edit the last for the repository. Keep the `.claude/checks/**` rule in `biome/layers.json`: `.claude/checks/` imports nothing outside `.claude/checks/`
   and `core/`.
2. Register the browser MCP server under the fixed name `playwright`. The explorer, healer and coverage agents name
   its tools (`mcp__playwright__browser_*`), so a server under another name leaves them without a browser.
3. Keep `.claude/settings.json`. It registers the `PreToolUse` hook (`.claude/hooks/readonly-shell.mts`) that limits
   the read-only roles to an allowlist of shell commands and confines the healer's writes. The hook command
   (`node "$CLAUDE_PROJECT_DIR/.claude/hooks/readonly-shell.mts" || exit 2`) is bash syntax and must run under bash.
   Under a PowerShell shell (`"shell": "powershell"`) it does not run as written: the check may not run at all or may
   block every call, depending on the PowerShell version. Run the hook under bash, and on Windows use Git Bash.
4. Ship `@babel/parser` as a runtime dependency of whatever carries `.claude/checks/`. `.claude/checks/prove-fails.mts`, which the judge uses
   to prove that a test fails, imports it. Here it is a dev dependency only because one install serves the whole
   repository.
5. Add the git-ignore lines above.

### Checking the agents

`node .claude/checks/scan-prompts.mts` scans every shipped prompt, skill and command for client hosts and terms and caps each
agent definition at 8,000 characters; it exits 1 on a finding. Run it after changing any of them.

The evaluation suite that runs each role on fixed cases, and the unit tests of the `.claude/checks/` scripts, are kept outside
this repository.

## Scripts

| Script | Does |
|---|---|
| `npm run install:browsers` | Installs Chromium for Playwright |
| `npm run seed` | Seeds the dataset into the platform |
| `npm test`, `npm run test:*` | Runs tests (see above) |
| `npm run report`, `npm run report:open` | Builds and opens the Allure report |
| `npm run check` | Formats and lints with fixes |
| `npm run lint`, `npm run format` | Lint only, format only |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run codegen` | Regenerates GraphQL and REST types from the running platform |
