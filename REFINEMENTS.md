# Refinements

Review of the whole repository (core, api, dataset, fixtures, pages, all test projects, tooling, docs), done on 2026-09-30 on branch `vcst-6033`. Each item names where the problem is, what to do, and how to know it is done.

## Change log

| Date | Change |
|---|---|
| 2026-09-30 | Initial review. |
| 2026-09-30 | GitHub workflow `.github/workflows/auto-tests.yml` added (manual run through the reusable `VirtoCommerce/.github` Playwright workflow). R8.2 done; R0.3, R8.4, R8.7, R8.8 partly covered; new items R8.17–R8.22 from the workflow review. |
| 2026-09-30 | `backend-packages.json` restored from `dev` (R8.17 done). README: new "Continuous integration" section (inputs, what the shared workflow does, secrets, keeping `backend-packages.json` current), CI artifact instructions under Reports, `backend-packages.json` and `.github/workflows/` in Prerequisites and Project structure. |
| 2026-09-30 | Format: section tables replaced by one heading per item with emoji status (⬜ to do, ✅ done, ❌ won't do) and labelled description lines; content unchanged. |
| 2026-09-30 | `backend-packages.json` bumped to edge versions (platform 3.1074.0, 27 modules); README explains how to keep it on edge. |
| 2026-09-30 | Allure report grouped by suite through `allurerc.mjs` (R8.23 done); new items R8.24 (Allure ids ignore the suite) and R8.25 (seed step not coloured on CI); README Reports section explains the grouping and manual `allure-results/` cleanup. |
| 2026-09-30 | CI run 127 analysed: pre-signed-in browser sessions were anonymous behind nginx (R1.11 done: browser tokens now go through `FRONTEND_BASE_URL`); new items R4.15 (configurable card click) and R8.26 (CI keeps only the last suite's traces); README explains the frontend token path and `VERIFY_SSL` for a local dev server. |
| 2026-09-30 | CI run 128 analysed (all three databases): pre-signed-in sessions now work; R4.15 done (card link opens a new tab in release builds) and new R3.15 done (pickup keyword test too strict on MySQL / SQL Server). |
| 2026-10-01 | CI run 128, attempts 10–14 (3 workers, `fullyParallel: true`, 15 jobs) analysed: R2.13, R2.14, R4.16–R4.18, R5.13 and R6.14 done; new R5.14, R6.15, R8.27; R2.1 corrected (keep `mode: "default"` under `fullyParallel`). |
| 2026-10-06 | Layer-by-layer refactoring (core, api, dataset, fixtures, then the specs): R1.1, R1.2, R1.4–R1.6, R1.10, R2.7, R2.9, R2.10, R3.9, R3.10, R5.1–R5.3, R5.5, R5.8–R5.10, R5.12, R6.1, R6.3–R6.5, R6.7–R6.13 and R8.9 done; R2.8 won't do; R3.11–R3.13, R5.11, R7.1, R8.11 and R8.16 partly done; new R8.28 (`E2E_WORKERS` default). Types regenerated against the platform; CLAUDE.md and `.claude/` adopted from `dev` and rewritten for TypeScript. |
| 2026-10-06 | R1.3 done: cart-validation helpers fail on a missing cart instead of passing. |
| 2026-10-06 | R1.7 done: the created-date filter test uses the platform's timestamps (the platform ignores `createdDate` in order payloads) and expects exactly the orders inside a narrow window. |
| 2026-10-06 | R1.8 done: indexing tests read the progress notification instead of the job state; the cancel test cancels a running full reindex and fails when cancel does nothing (checked with the cancel call removed). README lists the stuck indexation lock and the misleading job state under known platform issues. |
| 2026-10-06 | R1.9 done: the indexed order search flag is checked against the registered `CustomerOrder` index. Section 1 (Correctness) complete. |
| 2026-10-06 | R0.4 decided (own-change cleanup) and R2.1 done: list settings add and remove only the test's own values, `settings.spec` no longer toggles indexing jobs, `registerSettingRestore` restores unset settings to their default, the background-job test moved into the serial indexing spec. |
| 2026-10-06 | Fixed items marked done before commit: "commit pending" removed from 43 status lines, and the status rule now says to mark ✅ once the fix is on a branch (commit or PR added later). Status counts cross-checked against the headings. |
| 2026-10-06 | R2.2 done: every frontend test removes its browser user's default cart through `storageState`, so UI-only cart tests no longer leak carts. |
| 2026-10-06 | R2.3–R2.6 done and verified on a freshly seeded edge platform: save-for-later uses a fresh customer account, the checkout order and promotion coupons are cleaned up by owner (registered before creation), parallel creates register cleanup by draft id first. |
| 2026-10-06 | R2.11 done: the notifications tests run as a new platform user with one notification of its own, so other files cannot change the counts. |
| 2026-10-06 | R2.12 done (decision: keep the local-storage upload test, annotate the leftover file, list it in README known platform issues). Section 2 (Isolation and cleanup) complete. |
| 2026-10-06 | R3.1 done: "save evaluated product completeness" checks the channel's stored percent; "send a verification email" checks the journal and is marked `test.fail` (the platform sends no confirmation email; README known platform issues). |
| 2026-10-06 | R3.2 done: weak REST assertions in 12 specs replaced by checks of the arranged entity, exact values or finished jobs; shared `findPushNotification` for job notifications; `getProductPrices` dataset getter. |
| 2026-10-06 | R3.3 done: weak GraphQL assertions in 6 specs replaced by exact seeded values, counts and promotion amounts; new `WhiteLabelingClient` / `arrangeWhiteLabeling`. Noted: on the freshly deployed edge platform the pickup-location specs fail because new pickup locations are not searchable within their 5 s wait (not investigated yet). |
| 2026-10-06 | Decisions R0.1–R0.3, R0.6, R8.28 taken and implemented (sign-in backoff, secret redaction, CI scope, CI retries, 3 workers), R0.5 partly (known-issues list); sections 3 (test quality) and 2 (new R2.15: one administrator per worker) complete; section 4 mostly done (page-builder waits, blades, search, date picker, scoped and exact locators, operation-name waits). Local Elasticsearch (1 GiB) degrades under 3 frontend workers; e2e-frontend verified with 1 worker. |

## How to use this file

- Every item is a heading `<status> <ID> · <priority> · <title>` followed by **Where**, **Problem**, **What to do** and, where useful, **Done when**.
- Status:
  - ⬜ to do
  - ✅ done: swap the emoji when the fix is on a branch and add a **Done in:** line with the branch and date (the commit or PR, once there is one).
  - ❌ won't do: add a **Reason:** line.
- After changing a status, update the counts in [Progress](#progress).
- Priority: **P1** fix first (wrong results, data leaks, broken setups), **P2** reliability and maintainability, **P3** polish and consistency.
- Items marked **decision** need a choice before work starts; they are collected in [Section 0](#0-decisions-needed).
- Line numbers are from the review date; search by symbol name if they have moved.

## Progress

**Total: ✅ 85 done and ❌ 2 won't do, of 129.**

- ⬜ [0. Decisions needed](#0-decisions-needed): 5 of 6 (R0.1–R0.4, R0.6); partly R0.5
- ✅ [1. Correctness](#1-correctness): 11 of 11 (R1.1–R1.11)
- ✅ [2. Isolation and cleanup](#2-isolation-and-cleanup): 14 of 14 (R2.1–R2.7, R2.9–R2.15); ❌ R2.8
- ✅ [3. Test quality](#3-test-quality): 15 of 15 (R3.1–R3.15)
- ⬜ [4. Page objects and e2e](#4-page-objects-and-e2e): 13 of 17 (R4.1–R4.7, R4.9, R4.14–R4.18); ❌ R4.10; partly R4.8, R4.11–R4.13
- ⬜ [5. API clients](#5-api-clients): 9 of 14 (R5.1–R5.3, R5.5, R5.8–R5.10, R5.12, R5.13); partly R5.11
- ⬜ [6. Dataset and fixtures](#6-dataset-and-fixtures): 12 of 15 (R6.1, R6.3–R6.5, R6.7–R6.14)
- ⬜ [7. GraphQL documents](#7-graphql-documents): 0 of 7; partly R7.1
- ⬜ [8. Configuration, tooling, CI, docs](#8-configuration-tooling-ci-docs): 6 of 28 (R8.2, R8.5, R8.9, R8.17, R8.23, R8.28); partly R8.11, R8.16

## Suggested order of work

1. **Section 0 decisions**, so nothing is blocked later.
2. **All P1 items** (sections 1 and 2): they make runs trustworthy and stop leaking data.
3. **CI pipeline (R8.1–R8.3)**, so every later refactoring is checked automatically.
4. **Shared helpers first, then their callers:** R5.1–R5.3 (response helpers) before R5.4+; R6.9 (seeded constants) before the duplicate-removal items in sections 3 and 4.
5. The remaining P2, then P3, section by section.

---

## 0. Decisions needed

### ✅ R0.1 · Sign-in retry: backoff or shared token

- **Decision:** Sign-in retry for the concurrent same-user `/connect/token` 500
- **Options:** a) longer exponential backoff with jitter (6 attempts, up to ~11 s); b) sign in once per run and share the token between workers
- **Notes:** Bug report: [BUG-concurrent-token-sign-in-500.md](BUG-concurrent-token-sign-in-500.md). Current: 3 attempts ~0.2–0.6 s (`api/auth/token-auth-client.ts:68-73`).
- **Done in:** `vcst-6033`, 2026-10-06, decided **a**: `TokenAuthClient` retries a 5xx sign-in up to 6 times with exponential backoff and jitter (0.3, 0.6, 1.2, 2.4, 4.8 s plus up to 0.3 s each, about 10 s in total).

### ✅ R0.2 · HTTP logging redaction is expected but missing

- **Decision:** HTTP logging safety features that are expected but **not in the code**: secret redaction, `Secret` env values, `onExchange` listener, redacted network-error call logs
- **Options:** a) implement them; b) confirm they were dropped
- **Notes:** Earlier design notes describe them as agreed; `api/http/http-client.ts` calls `context.fetch` directly and nothing redacts `Authorization` headers or passwords.
- **Done in:** `vcst-6033`, 2026-10-06, decided **a**: `core/redact.ts` (`redactSecrets`) masks JSON fields, query parameters and header lines whose names contain password, secret, token, api key, authorization or cookie, and `Bearer`/`Basic` credentials. Applied to `HttpError` messages (URL and body excerpt), the database-conflict retry warning, and network errors from `APIRequestContext.fetch` (their call log lists request headers). Checked against token responses, password payloads, query strings and header logs. The `Secret` env wrapper and the `onExchange` listener stay dropped: nothing logs the env or every exchange.

### ✅ R0.3 · Scope of the CI pipeline

- **Decision:** Scope of the CI pipeline
- **Options:** quality job on every PR; e2e/API job manual + nightly; destructive tests opt-in
- **Notes:** **Partly decided:** manual test runs exist (`auto-tests.yml`, suite choice + `--grep`). Still open: PR quality job (R8.1), nightly schedule (R8.20), destructive runs (R8.3), database matrix (R8.19).
- **Done in:** decided 2026-10-06: PR quality job on every PR (R8.1), postgres-only test runs with a database input for the full matrix (R8.19), nightly schedule (R8.20), workers and destructive tests as dispatch inputs (R8.3, R8.22). Implemented in section 8.

### ✅ R0.4 · Where platform-wide settings tests run

- **Decision:** Where platform-wide settings tests run
- **Options:** a) one serial project (`workers: 1`) for everything that changes global settings; b) keep them in their files but make restore undo only the test's own change
- **Notes:** See R2.1.
- **Done in:** decided 2026-10-06: **b**. A serial project would need a CI suite-mapping change and still not isolate settings that affect the graphql and e2e projects.

### ⬜ R0.5 · Tracker keys for known product issues

- **Decision:** Tracking of known product issues
- **Options:** Every `test.fail(true, …)` and the `test.fixme` gets a tracker key in its reason
- **Notes:** 6 `test.fail` (page builder toasts, duplicate permalink, verbatim permalinks, store without name) and 1 `fixme` (theme zip).
- **Partly done** (`vcst-6033`, 2026-10-06): decided: one list. Every known issue is in `dataset/known-issues.ts` (`KNOWN_ISSUES`, with `tracker` and `summary`) and marked with `test.fail(true, describeIssue(KNOWN_ISSUES.<key>))` or `test.fixme`; the report shows `[no tracker key]` until a key is set. Docs (README, CLAUDE.md, `.claude/`) describe the pattern. Left: fill in the tracker keys for the seven issues.

### ✅ R0.6 · Retries on CI

- **Decision:** Retries on CI
- **Options:** `retries: 1` on CI only, or none
- **Notes:** Retries hide flakiness; they also stop a single slow-environment timeout from failing a nightly run.
- **Done in:** `vcst-6033`, 2026-10-06: `retries: 1` when `CI` is set (0 locally, 0 for the seed project); a retried pass is reported as flaky. README updated.

---

## 1. Correctness

Things that make results wrong or setups fail.

### ✅ R1.1 · P1 · Unset `GOOGLE_MAPS_API_KEY` breaks the dataset

- **Where:** `core/env.ts:32`, `dataset/data/stores/acme_electronics.json:81`, `core/interpolate.ts:16`
- **Problem:** `GOOGLE_MAPS_API_KEY` is declared optional, but the store data interpolates it and interpolation throws when it is missing, so an unset key breaks **every** test that loads the dataset.
- **What to do:** Either make it required (`string().min(1)`), or support an empty default in interpolation; align README and `.env.example`.
- **Done when:** Unset key: either a clear start-up error or tests run.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `GOOGLE_MAPS_API_KEY` defaults to `""` and `${ENV:…}` placeholders read the validated env (`dataset/dataset.ts` `fromEnv`), so an unset key seeds an empty key.

### ✅ R1.2 · P1 · Seeder ignores `succeeded:false`

- **Where:** `dataset/seeder.ts:76`
- **Problem:** Seeding only checks the HTTP status. User creation answers `200 {succeeded:false}` (existing user, rejected password), so users are "seeded" without error and a changed `USERS_PASSWORD` is never applied.
- **What to do:** Check `succeeded` for security endpoints (manifest flag or dedicated user upsert: find → create / reset password).
- **Done when:** Re-seed with a new password actually changes it; a rejected password fails the seed.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. Users have their own seeder (`seedUsers` in `dataset/seeder.ts`): find, then create or reset the password, checked with `expectSucceeded`. Roles and `memberId` of existing users are still not updated.

### ✅ R1.3 · P1 · Cart-validation checks pass vacuously

- **Where:** `tests/graphql/cart/cart-validation.spec.ts:232-260`
- **Problem:** `readCartValidation` returns `undefined` errors when the cart is missing, and `expectNoQuantityError(undefined)` passes: five "no error" tests can pass vacuously.
- **What to do:** `requireFields` on the returned cart before reading errors.
- **Done when:** The tests fail when the cart is null.
- **Done in:** `vcst-6033`, 2026-10-06. `readLines`, `readCartValidation` and `readAliasedValidation` unwrap the cart with `requireFields`, so a missing cart fails with "Validation of cart … is missing". The error helpers take only non-null arrays, so passing `undefined` no longer compiles, and the `?? []`/`?? ""`/`?.` fallbacks are gone. The spec passed 24 of 24 against the local platform (`--repeat-each=3`).

### ✅ R1.4 · P1 · Empty entity sends `PUT []`

- **Where:** `dataset/seeder.ts:40-46`, `dataset/seed-requests.ts:13`
- **Problem:** An entity with no items still sends a request; for array payloads that is `PUT []`, which can wipe e.g. store aggregation properties.
- **What to do:** `continue` after the "no items" warning.
- **Done when:** Empty entity folder sends nothing.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. An entity with no items is skipped (`continue` after the warning).

### ✅ R1.5 · P2 · `"(anonymous)"` sent as the operation name

- **Where:** `api/graphql/graphql-client.ts:49`
- **Problem:** For an unnamed document the placeholder `"(anonymous)"` is sent as `operationName`, which the server rejects. (All current documents are named.)
- **What to do:** Send `operationName` only when found; keep the placeholder for messages.
- **Done when:** Unnamed document executes.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `operationName` is sent only when the document has one; `"(anonymous)"` is used in messages only.

### ✅ R1.6 · P2 · GraphQL client parses the body before checking the status

- **Where:** `api/graphql/graphql-client.ts:54-59`
- **Problem:** The body is parsed before the status is checked, so a 502 HTML page or empty 401 fails with "not valid JSON" instead of the HTTP error.
- **What to do:** Check `!response.ok` first, parse leniently.
- **Done when:** 502 shows the status error.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. A non-2xx response without a JSON content type fails with the HTTP error before parsing.

### ✅ R1.7 · P2 · Organization orders read without a sort

- **Where:** `tests/graphql/orders/orders.spec.ts:51-53`
- **Problem:** `orders[0]` is called "newest organization order" but the query has no sort.
- **What to do:** Pass `sort: "createdDate:desc"`.
- **Done when:** Deterministic order.
- **Done in:** `vcst-6033`, 2026-10-06. The platform ignores `createdDate` in the order payload and stores the UTC time of the create, so all seeded orders carry seeding-time dates a few dozen milliseconds apart (and the unsorted list came back oldest first). The ±7-day window around any of them contained every seeded order, so the filter was never shown to exclude anything. The test now reads the seeded organization orders with `sort: "createdDate:asc"`, builds a window between the midpoints of the 1st/2nd and 3rd/4th orders' platform timestamps, and expects exactly the 2nd and 3rd orders; orders created later by other tests fall outside it. Passed 3 of 3 runs (`--repeat-each=3`).

### ✅ R1.8 · P2 · "Cancel an indexation" passes whether cancel works or not

- **Where:** `tests/restapi/search/indexes.spec.ts:59-73`
- **Problem:** "cancel an indexation" asserts `completed === true`; a one-document indexation finishes on its own, so the test passes whether cancel works or not.
- **What to do:** Cancel a long job and assert an aborted/cancelled state, or drop the test.
- **Done when:** Test fails if cancel is a no-op.
- **Done in:** `vcst-6033`, 2026-10-06. The job state is `Succeeded` for completed, canceled and even refused indexations, so the tests now read the progress notification (`SearchIndexesClient.getProgress`): "cancel a running indexation" starts a full product reindex with `batchSize: 1`, waits until documents are processed, cancels, and expects "Indexation has been canceled" with fewer documents processed than the total; it is `@destructive` because the cancel endpoint stops whatever indexation is running, and skips when the platform answers 501 (no cancellation support). "reindex a product" and "drop and rebuild" now expect "Indexation completed successfully" with no errors; "reindex a product" was shown to fail while the platform refused indexation, where the old version passed. With `RUN_DESTRUCTIVE_TESTS=true` all 5 tests of the spec pass; with the cancel call removed, the cancel test fails ("Indexation completed successfully" instead of "Indexation has been canceled").

### ✅ R1.9 · P2 · `typeof` tautology in orders

- **Where:** `tests/restapi/orders/orders.spec.ts:101-103`
- **Problem:** Tautology: `typeof enabled === "boolean"`.
- **What to do:** Compare with the known configuration, or remove.
- **Done when:** Assertion can fail.
- **Done in:** `vcst-6033`, 2026-10-06. The flag comes from the platform's app configuration `Search:OrderFullTextSearchEnabled` (default `false`), which tests cannot read; the same switch decides whether the Orders module registers its `CustomerOrder` search index. The test "the indexed order search flag matches the registered order index" now expects the index list to contain `CustomerOrder` exactly when the flag is `true`, so it holds for either configuration and fails when the two disagree. The REST orders spec passes (15 of 15).

### ✅ R1.10 · P2 · `getStockQuantity` fails for zero-stock records

- **Where:** `dataset/stock.ts:12-27`
- **Problem:** `getStockQuantity` throws "missing" for a center that has an inventory record with 0 stock, because zero-stock records are filtered out first.
- **What to do:** Look up the raw record; return 0 or throw "not stocked".
- **Done when:** Zero-stock center gives 0 or a clear error.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `getStockQuantity` reads the raw inventory record: 0 for zero stock, a clear error when no record exists.

### ✅ R1.11 · P1 · Pre-signed-in browser sessions are anonymous on CI

- **Where:** `fixtures/browser.fixture.ts`, `fixtures/api.fixture.ts` (`openFrontendContext`), `api/auth/browser-sessions.ts`
- **Problem:** Browser tokens were issued by `BACKEND_BASE_URL` (`iss: http://localhost:8090/`). On CI the frontend reaches the platform through nginx, which forwards `Host: localhost`; xAPI checks the issuer against the request host and silently treats the token as anonymous. CI run 127 (postgres/opensearch): 26 of the 27 e2e-frontend failures were "(customer account)" tests on an anonymous page; locally it worked because the Vite proxy rewrites the host (`changeOrigin`).
- **What to do:** **Done:** `browserSessions` gets its tokens from its own `TokenManager` over `FRONTEND_BASE_URL` (`/connect/token` and `/revoke/token` are proxied by nginx and Vite), so the issuer matches the host the browser uses. README (signed-in users, `VERIFY_SSL`) updated: locally Node must trust the dev server certificate (`VERIFY_SSL=false` or `NODE_EXTRA_CA_CERTS`).
- **Done when:** "(customer account)" e2e tests pass on CI. Verified locally: 18/18 in organizations-menu, header, wishlist-lists.

---

## 2. Isolation and cleanup

Data leaks and interference between parallel tests.

### ✅ R2.1 · P1 · REST files race on global settings

- **Where:** `tests/restapi/platform/settings.spec.ts:65-91`, `content/validation.spec.ts:79-91`, `content/files.spec.ts:90-97`, `catalog-personalization/tags.spec.ts:40-53,205-213`, `catalog/products.spec.ts:159-182`, `search/indexes.spec.ts`, `platform/system.spec.ts:62-73`
- **Problem:** Several files change the same global platform settings (file-extension blacklist, indexing jobs, member groups, tag inheritance, editorial review types) and restore a snapshot; files run in parallel, so restores overwrite each other. `files.spec` relies on the blacklist without arranging it. `mode: "default"` only orders the tests inside a file; the race is between files.
- **What to do:** Per decision R0.4. Also: `files.spec` arranges its own blacklist entry. Keep the `test.describe.configure({ mode: "default" })` calls: since `fullyParallel: true` they stop the tests of these files from overlapping each other (`search/indexes.spec.ts` got one too, see R2.14).
- **Done when:** Global-settings tests cannot overlap; `files.spec` passes alone.
- **Done in:** `vcst-6033`, 2026-10-06, per R0.4 b:
  - List settings (blacklist, member groups, review types) are changed through `arrangeSettingValue` (adds only if missing, removes only its own value) or `registerSettingValuesRemoval` + `addSettingValue`/`replaceSettingValue`; no snapshot restores, so files no longer overwrite each other. `files.spec` arranges its own `.exe` blacklist entry. The setting name is shared as `FILE_EXTENSIONS_BLACKLIST_SETTING` in `dataset/builders/content.ts`.
  - `settings.spec` toggled `VirtoCommerce.Search.IndexingJobs.Enable`, which switches background indexing for the whole platform while graphql and e2e tests run; it now toggles `Inventory.LogInventoryChanges`, which nothing else reads.
  - `registerSettingRestore` restored a snapshot whose `value` was `null` for unset settings; the platform ignores `null`, so the setting stayed changed. It now restores the effective value (`value ?? defaultValue`). This is how a local platform ended up with `IndexingJobs.Enable = false`.
  - The background-job test moved from `system.spec` into `indexes.spec` (serial), so its indexation no longer collides with the indexing tests; it waits for its indexation to finish.
  - Verified: the five shared-settings files passed 120 of 120 runs with `--repeat-each=3` in parallel, with no test values left in any list setting; `indexes.spec` + `system.spec` pass alone; `files.spec` passes alone. Remaining intermittent indexing failures came from the local Elasticsearch container (1 GiB limit) restarting under load, not from the tests.
  - "Done when" was written for option a. With option b the tests still overlap but no longer undo each other's changes. Residual risk: two tests adding to the same list setting within the same few milliseconds both read the old list, and one value is lost (that test then fails its own check; nothing leaks). Not seen in 120 parallel runs; if it shows up, serialize the writes to one setting (option a for that setting only).
  - The local platform had `IndexingJobs.Enable = false` and `LogInventoryChanges = true` left by the old restore bug; both reset to their defaults.

### ✅ R2.2 · P1 · UI-only cart tests leak the default cart

- **Where:** `tests/e2e/frontend/catalog/category.spec.ts:118-206`, `catalog/product-configuration.spec.ts:23-153`, `wishlists/wishlist-items.spec.ts:122`, `cart/cart-merge.spec.ts:51-79`; `fixtures/shopper.fixture.ts:32`
- **Problem:** Tests that add to the cart only through the UI do not request `shopper`, so the default cart is never removed.
- **What to do:** Register default-cart removal inside `storageState` when `app === "frontend"` (it already knows the credentials / anonymous id), so every frontend test cleans up without asking. Do **not** make `storageState` depend on `frontendContext` (breaks the backend project, where `user` is the platform admin).
- **Done when:** No carts left for test users after a frontend run.
- **Done in:** `vcst-6033`, 2026-10-06. `storageState` registers the default-cart removal for every `app === "frontend"` test, using the new `browserShopper` (`fixtures/browser.fixture.ts`), which builds the shopper from the browser customer account, the `user` option or the anonymous id without the `frontendContext` fixture; `shopper` uses the same function and no longer registers its own removal. `cart-merge.spec` keeps its explicit removal for the account the browser signs in to mid-test. Verified: before the change the four listed specs left 8 default carts (7 anonymous, 1 signed-in); after it, 0. The frontend cart specs and the e2e-backend project still pass (one unrelated known-issue case in `page-builder/search-and-validation.spec.ts` passed unexpectedly).

### ✅ R2.3 · P1 · Cart save-for-later uses a seeded user

- **Where:** `tests/graphql/cart/cart-save-for-later.spec.ts:20-56`
- **Problem:** Uses the seeded `acme_store_maintainer_1`; the saved-for-later list is one per user and the cleanup deletes the whole list; exact `toEqual` breaks if anything else saved items.
- **What to do:** Use `customerAccount`, as the second describe in the file does.
- **Done when:** No seeded user's list is modified.
- **Done in:** `vcst-6033`, 2026-10-06. Both tests run as a fresh `customerAccount` in one `(customer account)` describe; no seeded user is used. Verified: both pass on a freshly seeded edge platform.

### ✅ R2.4 · P1 · Checkout order cleanup registered late

- **Where:** `tests/e2e/frontend/checkout/checkout-order.spec.ts:45-54`
- **Problem:** Order cleanup is registered only after the assertion and only if a number was found: a timeout leaks the order.
- **What to do:** Capture the order from the create-order GraphQL response (or register cleanup by order number before asserting), `requireFields` instead of `if`.
- **Done when:** Failed run leaves no order.
- **Done in:** `vcst-6033`, 2026-10-06. New `registerCustomerOrdersRemoval` (`dataset/arrange/order.ts`) deletes every order of a customer; "place an order" registers it for the test's `anonymousUserId` before placing the order. The assertion now expects exactly one order for the shopper and the completed page to show its number (`requireFields` instead of `if`). Verified: the spec passes; with the assertion forced to fail after the order was placed, no order created during the run was left.

### ✅ R2.5 · P2 · `Promise.all` creates leak one entity on failure

- **Where:** `contacts/contacts.spec.ts:98-132`, `contacts/employees.spec.ts:56-77`, `contacts/members.spec.ts:75-146`, `contacts/organizations.spec.ts:58-166`, `marketing/dynamic-content.spec.ts:123-126`
- **Problem:** `Promise.all` creates two entities and registers cleanup only after both succeed; if one fails, the other leaks.
- **What to do:** Register cleanup by draft id first (builders set ids), then create.
- **Done when:** Pattern gone from REST specs.
- **Done in:** `vcst-6033`, 2026-10-06. Contacts, employees, members and organizations (11 tests): cleanup is registered by the builder-set draft ids before the parallel creates. Dynamic content (no id in the payload): the two entities are created one after another, each registered right after creation. Verified: all contacts and marketing specs pass (78 of 78 contacts tests with `--repeat-each=2`); the bulk-delete tests show that deleting already-deleted ids is accepted.

### ✅ R2.6 · P2 · Coupon cleanup registered late

- **Where:** `tests/restapi/marketing/promotions.spec.ts:110-170`
- **Problem:** Coupon cleanup registered after assertions / inside an `assert:` step.
- **What to do:** Register by code before `saveCoupons` (find-then-delete).
- **Done when:** —
- **Done in:** `vcst-6033`, 2026-10-06. New `registerPromotionCouponsRemoval` (`dataset/arrange/promotion.ts`) deletes every coupon of a promotion; the three coupon tests register it right after the promotion's cleanup and before saving a coupon. Registering by code (as suggested) would miss the coupon the update test renames; the promotion is unique per test, so removing all its coupons is safe. Verified: `promotions.spec` passes.

### ✅ R2.7 · P2 · `arrangeApiKey` and `arrangePage` register cleanup late

- **Where:** `dataset/arrange/security.ts:29-32`, `dataset/arrange/page-builder.ts:11-12`
- **Problem:** `arrangeApiKey` and `arrangePage` register cleanup after the create/validation, so a failing check leaks.
- **What to do:** Register first, find by key value / unique name inside the cleanup.
- **Done when:** —
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `arrangeApiKey` registers its cleanup first and finds the key by value. `arrangePage` is unchanged: the page id comes from the server, and a response without `id` could not be deleted by id anyway.

### ❌ R2.8 · P2 · `saveMemberAddress` registers no cleanup

- **Where:** `dataset/arrange/contact.ts:17-42`
- **Problem:** `saveMemberAddress(es)` registers no cleanup; with a seeded organization (option `customerAccountOrganizationId`) test addresses stay forever.
- **What to do:** Take `cleanupStack`, register removal, rename to `arrangeMemberAddress(es)`.
- **Done when:** —
- **Reason:** The addresses belong to a per-test account and organization that are deleted after the test; the leak needed `customerAccountOrganizationId`, which is removed (R6.12). Registering cleanup would touch about 20 call sites and double-delete in tests that remove the address themselves.

### ✅ R2.9 · P2 · Deleted users stay in the token cache

- **Where:** `dataset/arrange/customer-account.ts:62-69`, `fixtures/customer-account.fixture.ts:124`
- **Problem:** Fresh accounts stay in the worker token cache after the user is deleted; `signOutAll` later refreshes/revokes tokens of deleted users.
- **What to do:** Push `tokenManager.signOut(username, storeId)` to `cleanupStack` right after the user is created.
- **Done when:** Token cache holds no deleted users at worker end.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `newCustomerAccount` registers `tokenManager.signOut` right after the account is created; `withCustomerAccount` also registers `BrowserSessions.signOut` (frontend token cache and backend cookie cache). Both run before the user is deleted.

### ✅ R2.10 · P2 · `addOrganizationMembership` has no find-or-create guard

- **Where:** `dataset/arrange/customer-account.ts:80-91`
- **Problem:** `addOrganizationMembership` has no find-or-create guard and no role, unlike `arrangeCustomerAccount`.
- **What to do:** Shared `ensureMembership(userId, organizationId, role)`.
- **Done when:** —
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. Both account helpers use one find-or-create `arrangeMembership`; `addOrganizationMembership` takes an optional role.

### ✅ R2.11 · P2 · Notifications test runs on the shared admin

- **Where:** `tests/restapi/platform/notifications.spec.ts:28-36`
- **Problem:** "mark all as read" then expects `newCount === 0` for the shared admin while other files create notifications.
- **What to do:** Run as a fresh user.
- **Done when:** —
- **Done in:** `vcst-6033`, 2026-10-06. Push notifications are per user (a user only sees the notifications they created), and `channels.spec` creates them for the store administrator, so the shared admin could get a new one between "mark all as read" and the check. Both tests now create a platform user and give it exactly one notification of its own by evaluating a test-owned completeness channel; a fresh user alone would have no notifications and "mark all as read" would pass without checking anything. "search" expects that notification (it only checked the response shape before); "mark all as read" expects it kept but no longer new. Verified: 6 of 6 with `--repeat-each=3`; with the mark-all call removed the test fails.

### ✅ R2.12 · P3 · Local-storage uploads cannot be deleted

- **Where:** `tests/restapi/platform/assets.spec.ts:55-65`
- **Problem:** Local-storage upload leaves a file behind (the platform cannot delete local-storage uploads).
- **What to do:** Document as a known limitation in the test (unique name already), or skip on shared environments.
- **Done when:** Decision recorded.
- **Done in:** `vcst-6033`, 2026-10-06. Decision: keep the test and record the leftover, no skip. The endpoint saves to the platform's local upload folder and returns only the file name; probed: downloading that name answers 404 and no endpoint lists or deletes the file, so no cleanup is possible through the API. One tiny, uniquely named file per run does not affect other tests, so a shared-environment switch would add configuration for no gain. The test carries a `leaves data` annotation (shown in the report) and README lists it under known platform issues.


### ✅ R2.13 · P1 · OAuth app tests see each other's apps

- **Where:** `tests/restapi/platform/oauth-apps.spec.ts:31,45`
- **Problem:** With `fullyParallel: true` the three tests run at the same moment, and a keyword search for one `test-client-…` id also returns the other tests' apps; the tests expected an exact list. Failed in 14 and 13 of 15 jobs (CI run 128, attempts 10–14 (3 workers, `fullyParallel: true`, 15 jobs)).
- **What to do:** **Done:** the search test asserts the result contains its app; the delete test asserts its id is no longer in the result.

### ✅ R2.14 · P1 · Index tests cancel each other's job

- **Where:** `tests/restapi/search/indexes.spec.ts`
- **Problem:** "cancel an indexation" ran at the same moment as "reindex a product" and cancelled its job (state `Deleted`). Failed in 13 of 15 jobs, always when the two started within milliseconds.
- **What to do:** **Done:** the file runs in order with `test.describe.configure({ mode: "default" })`; the indexing queue is platform-wide state.


### ✅ R2.15 · P1 · Parallel tests share one administrator

- **Where:** 35 REST specs (`seededUser(SEEDED_USERS.storeAdministrator)`), `platformAdminHttpClient` (`ADMIN_USERNAME`)
- **Problem:** Every worker signed in as the same two accounts: concurrent sign-ins of one user can fail with HTTP 500 (R0.1), and state that belongs to the signed-in user (push notifications, saved lists) is shared between parallel tests.
- **What to do:** One account per worker.
- **Done when:** No two running tests use the same credentials.
- **Done in:** `vcst-6033`, 2026-10-06: worker fixture `workerAdministrator` (`fixtures/api.fixture.ts`) creates an administrator with `ADMIN_USERNAME` when the worker starts and signs it out and deletes it when the worker ends; `platformAdminHttpClient` and `test.use({ user: asWorkerAdministrator })` sign in as it. Tests inside a worker run one at a time, so no two running tests share credentials. Seeded users (`seededUser`) stay for tests that need that identity. Verified: restapi 286 passed (no sign-in 500), graphql 154, e2e-backend and e2e-frontend green; no worker accounts left afterwards.

---

## 3. Test quality

Weak assertions, duplicates, hard-coded data.

### ✅ R3.1 · P1 · Tests without an assertion

- **Where:** `tests/restapi/catalog-publishing/channels.spec.ts:132-141`, `tests/restapi/platform/user-passwords.spec.ts:79-84`
- **Problem:** Tests without any assertion ("save evaluated product completeness", "send a verification email").
- **What to do:** Assert the stored result / returned status.
- **Done in:** `vcst-6033`, 2026-10-06.
  - "save evaluated product completeness": the completeness API has no read endpoint for entries, but saving them sets the channel's `completenessPercent` (probed: `null` before, the saved value after). The test now expects exactly one evaluated entry and the channel to take its percent. Verified: passes 3 of 3; with the save removed it fails (expected 75, received `null`).
  - "send a verification email": the endpoint answers 200 and the platform sends nothing (probed: no `ConfirmationEmailNotification` in the journal for a manager or a customer, on the seeded store or a test store with `Stores.EmailVerificationEnabled` on and a sender address). Decision: the test asserts that the confirmation email reaches the user through the notification journal and is marked `test.fail` with the reason, so it reports as soon as the platform starts sending; README lists it under known platform issues.

### ✅ R3.2 · P2 · Weak REST assertions

- **Where:** REST: `channels.spec.ts:104-108,122-128`, `tags.spec.ts:32-37,189-191`, `orders.spec.ts:78-80,125-127`, `notifications.spec.ts:22-25`, `changelog.spec.ts:22-46`, `system.spec.ts:27-29,70-72`, `health.spec.ts:21`, `authorization.spec.ts:47`, `assignments.spec.ts:72`, `prices.spec.ts:156-157`, `indexes.spec.ts:38,55`, `organizations.spec.ts:152`
- **Problem:** Assertions that pass on empty or arbitrary data (`length > 0` on shared data, `expect.any(...)`, `Array.isArray`, `every` on possibly empty list, job started but not finished).
- **What to do:** Assert the specific arranged entity / exact value; wait for jobs to finish.
- **Done in:** `vcst-6033`, 2026-10-06. Each check now asserts the arranged entity, an exact value or a finished job (values probed on the platform first):
  - `channels.spec`: channel evaluation waits for its notification and expects every product processed with no errors and a stored percent in 0–100 (the exact percent depends on products other tests add to the seeded catalog; a test-owned catalog is not indexed, so the job finds no products); product evaluation expects the seeded laptop's exact result (75 %: Properties 100, Descriptions 0, Prices 100, Seo 100).
  - `tags.spec`: "get member groups" arranges its own group and expects it listed; "synchronize outlines" waits for the synchronization to finish with no errors.
  - `orders.spec`: "list orders" expects the arranged order among the 20 newest, newest first; new payment / shipment expect type, `New` status, the order currency and the default number formats (`PI…` / `SH…`).
  - `changelog.spec`: both search tests create a user and expect its `Added` entry (by id, and among the newest `ApplicationUser` changes).
  - `system.spec`: the app list must contain the platform admin and the page-builder shell; system info a semantic version and a 64-bit process; the destructive restart expects the same version back.
  - `health.spec`: the report must contain the four platform checks and a database check; "search engine is reachable" reads the seeded product's indexed document.
  - `indexes.spec`: documents are matched by product code; "reindex a product" expects the document's `indexationdate` to move forward; the job state must be a known background-job state.
  - `authorization.spec`: the issued token must sign in as the created user (`currentuser`); the OAuth error must be `invalid_request`.
  - `assignments.spec`: the template's condition tree is `PriceConditionTree` with a `BlockPricingCondition` child. `prices.spec`: the widget lists exactly the seeded prices (new `getProductPrices` in `dataset/dataset.ts`). `organizations.spec`: exact renamed names.
  - `notifications.spec` was already fixed by R2.11.
  - Supporting code: `api/rest/clients/push-notifications.ts` (`findPushNotification`) now backs `SearchIndexesClient.findProgress`, new `CompletenessClient.findEvaluation` and new `PersonalizationClient.findSynchronization`; `evaluateChannel` and `synchronizeOutlines` return their notification with a required `id`.
  - Kept: "get the last modified date" still only checks for a valid timestamp; "forcing changes moves the last modified date forward" covers its behaviour.
  - Verified: the full restapi project passes (296 passed, 1 skipped), `--list` loads all 554 tests.

### ✅ R3.3 · P2 · Weak GraphQL assertions

- **Where:** GraphQL: `product-variations.spec.ts:40-53`, `page-context.spec.ts:54-66`, `cart-validation.spec.ts:263-271`, `cart-promotions.spec.ts:44-66`, `current-addresses.spec.ts:106,126`, `contact-search.spec.ts:31,41`
- **Problem:** Same kind: comparisons that pass on empty results, an assertion helper that returns early without asserting, `>=` where exact counts are known.
- **What to do:** Assert non-empty, exact counts, specific gift/discount values.
- **Done in:** `vcst-6033`, 2026-10-06. Expected values were probed on the platform first:
  - `product-variations.spec`: the family is pinned to its four colour variations; "by stock" expects all four (all are stocked in the seed), "by price" all four or none, "by colour" exactly that variation plus the family's main product (the main product's document carries every variation's colour). The unfiltered "arrange: every product of the family" searches are gone.
  - `page-context.spec`: available languages and currencies must equal the seeded store's. The early-returning white-labeling test is replaced by "return the white-labeling settings of the organization" (customer account): it saves two menu link lists and an organization white-labeling setting (new `WhiteLabelingClient`, `arrangeWhiteLabeling`) and expects the logo and both menus in the page context. The platform cannot delete these settings, so cleanup disables it; the test carries a `leaves data` annotation and README lists it.
  - `cart-validation.spec`: `expectScopedToLine` (returned without asserting when errors had no object) is replaced by `expectQuantityChangedOnLine`: exactly one `PRODUCT_QTY_CHANGED` error on that `LineItem`; cart-level checks expect exactly that code.
  - `cart-promotions.spec`: the coupon takes exactly 100 off the cart total and removing it restores the total (`subTotalDiscount` also counts sale prices, so it is not used); the A57 line is 50 off its list price; five S26 phones are 100 off each (500 in total); the gift is one A17.
  - `current-addresses.spec`: exact counts (1 and 2) for the fresh account.
  - `contact-search.spec`: role and status filters expect exactly the seeded contacts of the organization, derived from `dataset.users` roles and `dataset.contacts` statuses.
  - Verified: the changed specs pass; the graphql project passes except `cart-pickup-locations.spec` and `pickup-locations.spec`, whose new pickup locations are not searchable within 5 s on the freshly deployed edge platform (unrelated to these changes, see the note in the change log).

### ✅ R3.4 · P2 · Cart-lifecycle "get the cart" tests never query the cart

- **Where:** `tests/graphql/cart/cart-lifecycle.spec.ts:28-60`
- **Problem:** "get the cart of …" never calls the `cart` query.
- **What to do:** Arrange with `arrangeCart`, act with `GetCartDocument`.
- **Done in:** `vcst-6033`, 2026-10-06: both tests arrange a cart with `arrangeCart` and read it back with `GetCartDocument` by id, expecting the owner and the line item; the registered-user variant uses a fresh customer account instead of a seeded user.

### ✅ R3.5 · P2 · Duplicate REST tests

- **Where:** REST duplicates: `catalog/assets.spec.ts` vs `platform/assets.spec.ts`; `organizations.spec.ts:112-159`; `members.spec.ts:17-59,175-188`; `stores.spec.ts:92-112`; `users.spec.ts:111-121` vs `authorization.spec.ts:20-31`; `pricelists.spec.ts:95-110` vs `prices.spec.ts:20-35,75-90`; `health.spec.ts:42-50` vs `indexes.spec.ts:21-29`
- **Problem:** Tests repeating each other.
- **What to do:** Keep one of each; remove combined "create, rename, delete" variants.
- **Done in:** `vcst-6033`, 2026-10-06: removed `catalog/assets` generic folder/upload/list/delete tests (covered by `platform/assets`; the anonymous check moved there; the catalog spec keeps "add an asset to a product"), both "create, rename and delete" organization tests, "create a contact member in an organization" (same check as "list the organizations of a member"), "create, rename, find and delete a store", "add a product to a pricelist" (same as "add a price to a product") and health's "search engine is reachable" (same as "get an indexed product document"). "sign a user in and out" became "sign a user out" (sign-in is its arrange step; the token test covers sign-in). Kept on purpose: members' create/bulk/list tests call the generic `/api/members` endpoints, not the organization ones.

### ✅ R3.6 · P2 · Duplicate GraphQL tests

- **Where:** GraphQL duplicates: `pickup-locations.spec.ts:276-305` (Berlin/Billund) vs `:221-250`; `page-context.spec.ts:68-92`
- **Problem:** Same.
- **What to do:** Merge or remove.
- **Done in:** `vcst-6033`, 2026-10-06: removed the Berlin/Billund transfer test (the several-cities and combined-stock tests check transfers with exact quantities) and "combine store, user and slug in one context" (each part has its own test).

### ✅ R3.7 · P2 · Tests depend on files hosted on GitHub

- **Where:** `tests/restapi/catalog/assets.spec.ts:9`, `platform/assets.spec.ts:9-10`
- **Problem:** Upload-from-URL tests download from `raw.githubusercontent.com/.../dev/`: network or rename breaks them.
- **What to do:** Upload a local fixture first, then upload-from-URL that asset.
- **Done in:** `vcst-6033`, 2026-10-06: the suggested local fixture does not work — the platform cannot download from its own public URL inside the container (probed: 500). Instead the URLs are pinned to commit `08b9d932` (`dataset/remote-files.ts`), so renames and edits on `dev` cannot break them; network access is still needed. The catalog asset test uploads a local file and needs no network.

### ✅ R3.8 · P2 · Weak backend search and validation tests

- **Where:** e2e backend: `search-and-validation.spec.ts:131-135,161-166,95-100`
- **Problem:** Duplicate-permalink check spins through 15 reloads when correctly rejected; special-character assertions only run `if` the page exists (vacuous); required-fields case depends on the previous loop iteration.
- **What to do:** Assert explicitly on both outcomes; give both fields per case.
- **Done in:** `vcst-6033`, 2026-10-06: new `PageBuilderShell.createPage` saves through the UI and returns the `POST /api/page-builder-pages/grouped` response; the outcome is checked through the REST client (`findPagesNamed`). Duplicate permalink: expects a rejected save and no page (known issue, fails fast instead of 15 reloads). Special characters: if saved, the stored permalink must have no space, `?` or `#`, and no error toast; if rejected, a 4xx and no page — no vacuous `if`. The earlier unexpected pass of "spaces" came from that `if` (the permalink is stored verbatim). Required fields: one test per case, both fields given.

### ✅ R3.9 · P2 · Seeded ids repeated across specs

- **Where:** Seeded ids repeated across specs: `laptop-acer-predator-helios-neo-16-ai` (7 REST + 3 GraphQL + 3 e2e files), `smartphone-apple-iphone-17-256gb-black` (12 GraphQL), `…-mist-blue`, `sodimm-crucial-ddr4-2400-8gb`, `smartphone-samsung-galaxy-a57-5g` (5 e2e), configurable memory option names, variation SKUs
- **Problem:** Hard-coded in many files.
- **What to do:** Use the shared seeded-data constants from R6.9.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `dataset/seeded.ts` has `SEEDED_USERS` and `SEEDED_PRODUCTS` (products used by more than one spec); no copies of those literals are left in specs. Single-use ids stay as module constants in their spec.

### ✅ R3.10 · P3 · Admin username repeated in every REST file

- **Where:** `USERNAME = "acme_store_administrator@acme.com"` + identical `test.use` in all 40 REST files; seeded usernames in GraphQL
- **Problem:** Repeated.
- **What to do:** Export seeded user constants (R6.9) and an `asStoreAdministrator` option or shared `test.use` value.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `test.use({ user: seededUser(SEEDED_USERS.storeAdministrator) })` replaces the per-file username constant and `getCredentials` boilerplate (about 50 specs).

### ✅ R3.11 · P3 · REST helpers that belong in `dataset/arrange`

- **Where:** REST local helpers: `arrangeRole` (roles.spec.ts:129-145), `arrangeOrder`/`orderWithLineItem` (orders.spec.ts:230-242), `createCategoryWithProduct`/`createProduct` (tags.spec.ts, products.spec.ts), settings save/restore (6 places), `newApiKey` (5 places), `/connect/token` form bodies
- **Problem:** Helpers duplicated in specs.
- **What to do:** Move to `dataset/arrange/*` / builders (`arrangeSettingValue`, `arrange/order.ts`, `arrangeRole`, `newApiKey`); export `TOKEN_PATH`.
- **Done in:** `vcst-6033`, 2026-10-06: `TOKEN_PATH` is exported from `token-auth-client.ts`; `TokenAuthClient.postPasswordGrant` returns the raw response for negative sign-in tests (authorization, organization fallback). `orderWithLineItem` stays in `orders.spec` (spec-specific). `registerRoleRemoval` added for the role test that creates its role in `act:`.

### ✅ R3.12 · P3 · GraphQL helpers that belong in `dataset/arrange`

- **Where:** GraphQL local helpers: product configuration fetch (3 files), `Configuration-${id}` SKU (2), pickup helpers duplicated between `cart-pickup-locations` and `pickup-locations` specs, `quoteFromCart`/`registerQuoteRemoval`, invite helper, "create list + add item", manual `new GraphqlClient(await tokenManager.authorize(...))`
- **Problem:** Duplicated.
- **What to do:** Move to `dataset/arrange` (`quote.ts`, `pickup-location.ts`, `catalog.ts`), reuse `signInGraphqlClient`.
- **Done in:** `vcst-6033`, 2026-10-06: `arrangeShoppingListWithItems` (`dataset/arrange/shopping-list.ts`), `configuredSku` (`dataset/builders/product-configuration.ts`), `inviteEmployee` in `users.spec` (the only file inviting).

### ✅ R3.13 · P3 · `??` fallbacks hide missing data

- **Where:** `?? ""`, `?? []`, `?? 0`, `?? undefined`, `?.` hiding missing data in REST (settings, catalogs, changelog, orders, dynamic-content, promotions, assignments), GraphQL (cart-validation, pickup-locations, current-addresses, organizations-locked, contact-registration) and e2e (wishlist-items, wishlist-lists, checkout-pickup, shared-list) specs
- **Problem:** Violates the "no fallbacks" convention.
- **What to do:** `requireFields` / explicit assertions; see R6.1 for `null` support.
- **Done in:** `vcst-6033`, 2026-10-06: new `requireItems` (`core/required-fields.ts`) fails on a missing list or a `null` item; it replaces every `?? []` over GraphQL connections (checkout-pickup, wishlists, cart-configuration, pickup specs, contact-search, users). `?? ""`/`?? 0`/`?? false` and `template.id ?? null` are gone from specs; catalogs no longer patch `properties`; contact-registration asserts `organizations` as returned.

### ✅ R3.14 · P3 · Test naming and step conventions

- **Where:** Test naming and steps: imperative vs statement titles (REST health, seo, changelog, assets, user-lock); `act:` steps that only call arrange helpers; actions/assertions outside steps (several e2e and GraphQL specs); combined "act and assert:" steps; `orders.spec.ts:217-220` hard-codes 65 instead of `MAX_ORDER_NUMBER_LENGTH + 1`
- **Problem:** Inconsistent.
- **What to do:** One title style (imperative); every action in an `arrange:`/`act:`/`assert:` step.
- **Done in:** `vcst-6033`, 2026-10-06: imperative titles in the listed REST files (health, seo-infos, changelog, assets, user-lock); every "act and assert:" step split into `act:` and `assert:` (category, page search); bare awaits and expects in test bodies moved into steps (organizations menu, current addresses, page builder, category, dynamic content); the role test creates its role in `act:` without an arrange helper; `MAX_ORDER_NUMBER_LENGTH + 1` instead of 65. Statement titles elsewhere ("a deleted user …" style in GraphQL) are left: they describe behaviour and renaming all would reset Allure history.

### ✅ R3.15 · P2 · Pickup keyword test assumed the keyword is in the name

- **Where:** `tests/graphql/catalog/pickup-locations.spec.ts:61`
- **Problem:** The test required every location found by "Berlin" to have "Berlin" in its name. The keyword search also matches other fields (e.g. the id), and on MySQL and SQL Server it returned the seeded "Potsdamer Platz Arkaden" (city Berlin, id `…-berlin`); Postgres did not (most likely case-sensitive matching). Failed in the MySQL and SQL Server CI jobs only.
- **What to do:** **Done:** the test checks that the two seeded "… Berlin" locations are found and that every result has the keyword in its name or city (case-insensitive).

---

## 4. Page objects and e2e

### ✅ R4.1 · P1 · Page-builder wait loops give up silently

- **Where:** `pages/backend/page-builder/page-builder-shell.ts:79-100`, `pages-list-blade.ts:82-87`
- **Problem:** `waitUntilListed`, `waitUntilCounterMatchesList`, `waitForRows` are manual `waitForTimeout` loops that **give up silently**; tests then fail later on a vague check. Callers wrap them in one-shot assertions (5 places).
- **What to do:** Replace with `expect.poll` / `toPass` that fail with a clear message; callers assert directly.
- **Done in:** `vcst-6033`, 2026-10-06: `PageBuilderShell.expectListed(route, name, listed)` and `expectCounterMatchesList(route)` poll with `expect.poll` and fail with a message naming the page or menu; `PagesListBlade.expectRows` likewise. Callers no longer wrap one-shot checks. This exposed that the grid's "No results found" row counted as a data row (the old loop gave up silently); `DATA_ROW` now requires `[data-column-id]` cells.

### ✅ R4.2 · P2 · List-blade search can match an earlier response

- **Where:** `pages/backend/page-builder/pages-list-blade.ts:38-43`
- **Problem:** Search waits for any `page-builder-pages/search` response (can be a previous keyword) and casts the body with `?? 0`.
- **What to do:** Match the request's keyword; validate the body.
- **Done in:** `vcst-6033`, 2026-10-06: search waits for the `POST /api/page-builder-pages/search` whose `keyword` is the typed term (`isPagesSearch`), and throws when the body has no numeric `totalCount`.

### ✅ R4.3 · P2 · Blades picked by position; double navigation in `open()`

- **Where:** `pages/backend/page-builder/page-builder-shell.ts:45-46,57-65`
- **Problem:** List/details blades picked by position (`first()`/`last()`); `open()` navigates twice and waits for `networkidle`.
- **What to do:** Locate blades by title; navigate once and wait for the grid.
- **Done in:** `vcst-6033`, 2026-10-06: blades are found by content (the list blade has the search input, the details blade the permalink prefix), not by position; `open()` navigates once (a fresh `reload` query parameter forces a full load) and waits for the page-search response instead of `networkidle`. e2e-backend got faster (3.6 → 2.4 min).

### ✅ R4.4 · P2 · Date picker and configuration-expand waits

- **Where:** `pages/backend/shell/controls.ts:101-118`, `pages/frontend/components/product-configuration.ts:43-47`
- **Problem:** Date picker checks the new month before it renders and uses `.first()` over neighbour-month cells; closes by clicking a blade title. Configuration `expand()` does not wait for the expanded state.
- **What to do:** Wait for the month header change; exclude off-month cells; close with `Escape`; wait for `vc-widget--collapsed` to disappear.
- **Done in:** `vcst-6033`, 2026-10-06: the date picker waits for the month header to change after "next", excludes off-month cells (`dp__cell_offset`) and closes with Escape; configuration `expand()` polls until the section is no longer collapsed.

### ✅ R4.5 · P2 · `scrollToProduct` is an unbounded loop

- **Where:** `pages/frontend/pages/category-page.ts:31-50`
- **Problem:** `scrollToProduct` is an endless loop with `catch` as control flow and a string `evaluate`.
- **What to do:** Bounded loop or `expect.poll` over the loaded cards.
- **Done in:** `vcst-6033`, 2026-10-06: `scrollToProduct` polls (30 s, clear message) instead of looping forever, scrolls with the mouse wheel instead of a string `evaluate`, and has no `catch` control flow.

### ✅ R4.6 · P2 · Substring text matching plus `.first()`

- **Where:** `pages/frontend/pages/account-pages.ts:28`, `components/wishlist.ts:51-52`, `select-address-modal.ts:20-22`, `address-filters.ts:36-38`, `product-configuration.ts:51,76`, `address-form.ts:47,52`
- **Problem:** Substring `hasText` + `.first()` (e.g. `card("list-x")` also matches `list-x-edited`); wishlist menu items page-wide `:visible`.
- **What to do:** Use `exactText`; scope menus to the opened card.
- **Done in:** `vcst-6033`, 2026-10-06: exact text for wishlist cards (matched on `.wishlist-card__title`), configuration options and sections, country and region options, without `.first()`; wishlist card menu items are scoped to the card. Kept on purpose: `SelectAddressModal.address(text)` and filter chips match part of a card that holds more text than the label.

### ✅ R4.7 · P2 · Page-wide `[data-product-sku]` locators

- **Where:** `[data-product-sku]` page-wide in `cart-page.ts`, `account-pages.ts`, `checkout-pages.ts`, `category-page.ts`; `lineItem(sku)` copy-pasted 3 times
- **Problem:** Unscoped and duplicated.
- **What to do:** Scope to each list container; one shared helper.
- **Done in:** `vcst-6033`, 2026-10-06: `productItems`/`productItem` (`components/line-item.ts`) replace the three `lineItem(sku)` copies; the cart is scoped to `cart.products-section`, the category to its grid/list view, account pages to `.main-layout`. The checkout review page stays page-wide: its layout has no list container.

### ⬜ R4.8 · P2 · Duplicated e2e helpers

- **Where:** Duplicated e2e helpers: `signIn` + `waitForURL` (organizations-menu, cart-merge), ship-to-test-address (3 checkout specs), pick saved address (2), `addConfiguration` (2), `openDraft`/`openFrom` + "open then openPage" (4 files), `saveAndWaitForToast` (4 places), toolbar enabled/disabled checks (7 places)
- **Problem:** Duplicated in specs.
- **What to do:** `SignInPage.signIn(credentials)` that waits; checkout helpers in `checkout-support.ts`; `ProductPage.configure`; `PageBuilderShell.openPage(name, route)`, `PageDetailsBlade.save()`; `BladeToolbar` enabled/disabled locators.
- **Partly done** (`vcst-6033`, 2026-10-06): page builder done — `PageBuilderShell.openPage(name, route)`, `saveDetails()`, `createPage()`, `expectToolbarButtonEnabled/Disabled` replace `openDraft`/`openFrom`, `saveAndWaitForToast` and 13 class-regex checks. Left: frontend `signIn` + `waitForURL`, ship-to-test-address (3 checkout specs), pick saved address (2), `addConfiguration` (2).

### ✅ R4.9 · P2 · `networkidle` waits

- **Where:** `tests/e2e/backend/page-builder/page-status.spec.ts:234`, `search-and-validation.spec.ts:128,154`
- **Problem:** `waitForLoadState("networkidle")` after publish/save.
- **What to do:** Wait for the response, toast or badge.
- **Done in:** `vcst-6033`, 2026-10-06: no `networkidle` left; publish waits for `POST …/grouped/publishing/{id}`, saves for the save response or toast, `open()` for the page search.

### ❌ R4.10 · P2 · Add-to-cart variants do not wait for the mutation

- **Where:** `tests/e2e/frontend/catalog/category.spec.ts:150-151,205-206`
- **Problem:** Add-to-cart-button variants don't wait for the mutation (stepper variants do).
- **What to do:** `Promise.all([waitForResponse, click])`.
- **Reason:** the button variants are skipped on this frontend (stepper), so the mutation name cannot be observed or verified; each act is followed by an `assert:` step that waits for the cart badge, which only changes after the mutation completes, so the next act cannot race it.

### ⬜ R4.11 · P3 · Mixed wait styles

- **Where:** `pages/backend/shell/controls.ts:3,34,58`, `pages/backend/shell/controls.ts:24,178-185`, `product-configuration.ts:39`
- **Problem:** Mixed wait styles (`expect` vs `waitFor`) in page objects; `getAttribute("class") ?? ""`; `AppMenu.counter` returns 0 for a missing badge (a broken badge "matches" an empty list).
- **What to do:** One wait style; class checks via locators; counter returns `undefined`/throws.
- **Partly done** (`vcst-6033`, 2026-10-06): `AppMenu.counter` returns `undefined` without a badge and throws on non-numeric text; class checks use `classList` or locator assertions instead of `getAttribute("class") ?? ""`; new waits use `expect`. Left: remaining `waitFor` uses in older page objects.

### ⬜ R4.12 · P3 · Page-object naming and style

- **Where:** Naming/style: `ProductPage.addToCartButton` is a `Locator` while elsewhere a component; `okButton` vs `confirmButton`; `dropdownButton` vs `toggle`; modal constructors take `Page` or a root; duplicated `navigate`/`clickOutside` in two layouts; `CartPage.shippingCostLabel` duplicates the layout's; `title='Add to cart'` selectors depend on UI language
- **Problem:** Inconsistent.
- **What to do:** Align names and constructor convention; common base layout; `data-test-id` for cart buttons (request from frontend if missing).
- **Partly done** (`vcst-6033`, 2026-10-06): common base `Layout` (`navigate`, `clickOutside`, `shippingCostLabel`) for `MainLayout` and `CheckoutLayout`; `CartPage.shippingCostLabel` duplicate removed. Left: button naming (`okButton`/`confirmButton`, `dropdownButton`/`toggle`), modal constructor convention, `ProductPage.addToCartButton` type, `title='Add to cart'` selectors.

### ⬜ R4.13 · P3 · Unused page-object members

- **Where:** Unused page-object members (about 35), e.g. `BladeToolbar.itemIds`, `Blade.label`, `Card.title/body`, `ConfirmationPopup.cancel`, `ListToolbar.refresh`, `Chip.textLabel/closeButton`, `TopHeader.signInLink/signUpLink`, `AccountMenu.signOutButton`, `CheckoutFlow.clickOutside`, exported `MENU_ITEM_FOR_ROUTE`
- **Problem:** Dead code.
- **What to do:** Remove, or keep deliberately when a planned test uses it.
- **Partly done** (`vcst-6033`, 2026-10-06): removed `BladeToolbar.itemIds` and the `MENU_ITEM_FOR_ROUTE` export. Left: the other unused members.

### ✅ R4.14 · P3 · `fillIfGiven`, `force` clicks, loose mutation matching

- **Where:** `pages/frontend/components/address-form.ts:73-77`, `payment-details-section.ts:19`, `graphql-traffic.ts:12-18`
- **Problem:** `fillIfGiven` skips `""`; `uncheck({ force: true })`; `isGraphqlMutation("")` matches any mutation and tests pass loose fragments (`"cart"`, `"wishlist"`).
- **What to do:** `!== undefined`; click the visible label; prefer `isGraphqlOperation(name)`.
- **Done in:** `vcst-6033`, 2026-10-06: `fillIfGiven` fills `""` (only `undefined`/`null` skip); separate billing clicks the label and asserts the checkbox is unchecked (no `force`); `isGraphqlMutation` is gone — every wait names its operation (`UpdateShortCartItemQuantity`, `ChangeFullCartItemsQuantity`, `AddWishlist`, `ChangeWishlist`, `DeleteWishlist`, `AddWishlistBulkItem`, `DeleteWishlistItem`, `AddItemsCart`), observed on the running frontend.

### ✅ R4.15 · P2 · Configurable product card link opens a new tab on CI

- **Where:** `tests/e2e/frontend/catalog/category.spec.ts:213`, `pages/frontend/components/product-card.ts`
- **Problem:** Card links use the theme setting `details_browser_target` (`_blank`), but the frontend's dev build forces `_self` (`vc-frontend` `useThemeContext.ts`, `IS_DEVELOPMENT`). Locally (Vite dev server) the click navigated in place; on CI (release build) it opened a new tab and the test waited on the old one. Failed in every CI run.
- **What to do:** **Done:** `ProductCard.openConfigurations()` clicks the link and returns the page it opened in (the popup for `_blank`, the same page otherwise); the test asserts on that page. Verified locally against the dev server (`_self`) and the production frontend container (`_blank`).


### ✅ R4.16 · P1 · Cart merge signs in before the anonymous cart has loaded

- **Where:** `tests/e2e/frontend/cart/cart-merge.spec.ts`
- **Problem:** The frontend merges the anonymous cart on sign-in only if that cart is already loaded on the sign-in page (`vc-frontend` `useSignMeIn.ts`); the test submitted the form at once, so the merge was sometimes skipped. Failed in 3 of 15 jobs (PostgreSQL).
- **What to do:** **Done:** the test waits for the header cart badge to show the anonymous quantity before signing in. Verified locally 8/8 with 3 workers and `--repeat-each=4`.

### ✅ R4.17 · P2 · Shell select click lost during a section animation

- **Where:** `pages/backend/shell/controls.ts` (`Select.open`)
- **Problem:** The toggle was clicked once right after a section expanded; when the click landed during the animation, the dropdown never opened and the test waited 30 s. Failed once in 15 jobs.
- **What to do:** **Done:** `open()` retries the click (5 s per attempt) until the dropdown is visible. Note: `Card.body` (`> .vc-card__body`) does not match the shell markup; it is unused.

### ✅ R4.18 · P2 · Page-builder list waits could outlast the test timeout

- **Where:** `pages/backend/page-builder/page-builder-shell.ts` (`waitUntilListed`, `waitUntilCounterMatchesList`)
- **Problem:** 15 attempts of reload, `networkidle`, search and 2 s took about 2 minutes on a slow run, hitting the 120 s test timeout (the reserved-characters permalink test, 1 of 15 jobs).
- **What to do:** **Done:** both loops stop after 45 s; the caller's assertion decides. R4.1 (fail with a clear message instead of giving up silently) stays open.

---

## 5. API clients

### ✅ R5.1 · P2 · Four different not-found conventions

- **Where:** 20+ clients in `api/rest/clients`
- **Problem:** Four different "not found" conventions (404, `null` body, empty text, 204); `promotions-client.ts` mixes two in one class.
- **What to do:** One `HttpResponse` helper (e.g. `jsonOrUndefined<T>()`) used by every `find*`.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `HttpResponse.jsonOrUndefined()` covers 404, 204, empty body and `null`; every `find…()` uses it. `find…()` on stores, users, roles, pricing, coupons and menus now returns `undefined` on 404 instead of throwing.

### ✅ R5.2 · P2 · `SecurityResult` returned without checking `succeeded`

- **Where:** `users-client.ts:28-93`, `roles-client.ts:24-26`
- **Problem:** `SecurityResult` returned without checking `succeeded`; the check is copy-pasted in arrange helpers and specs.
- **What to do:** Shared `expectSucceeded(result, label)`; keep raw methods for negative tests.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `expectSucceeded(result, label)` in `dataset/arrange/security.ts`, used by `arrangeUser`, `arrangeRole` and the user seeder; client methods still return the raw result for negative tests.

### ✅ R5.3 · P2 · Unchecked `json<T>()` casts

- **Where:** `api/http/http-response.ts:51-53` + all clients
- **Problem:** `json<T>()` is an unchecked cast; only 2 clients validate with a schema; `requireFields` checks a few fields. Repeated `(results ?? []).map(requireFields)` and `requireFields(json(), FIELDS, label)` in every client.
- **What to do:** Shared helpers `requireJson(response, fields, label)` / `requireResults(...)`; decide whether `json()` returns `unknown`.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `requireEach(values, fields, label)` in `core/required-fields.ts` replaces the repeated `(results ?? []).map(requireFields…)`. `json<T>()` stays a typed cast; fields are checked through `requireFields`/`requireEach`.

### ⬜ R5.4 · P2 · Inconsistent search result shapes

- **Where:** `orders-client.ts:86-89`, `platform-client.ts:54-63`, `notifications-client.ts:17-20`
- **Problem:** Some `search*` return the raw result unvalidated, others validated arrays.
- **What to do:** One shape for all.

### ✅ R5.5 · P2 · Token refresh has no in-flight deduplication

- **Where:** `api/auth/token-manager.ts:29-68`
- **Problem:** No in-flight deduplication: parallel requests near expiry each refresh or sign in.
- **What to do:** Cache the pending `Promise<AuthToken>` per session.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `TokenManager` caches the pending `Promise<AuthToken>` per session, so parallel callers share one sign-in or refresh; a failed attempt removes itself.

### ⬜ R5.6 · P3 · Create/update verb names

- **Where:** Create/update verbs: `saveCatalog`/`updateCatalog`, `saveCategory`, `RolesClient.save` (PUT that creates), `saveCoupons` (POST `/add`), `saveEmployees` vs `createMany`
- **Problem:** Inconsistent names.
- **What to do:** `create` = POST, `update` = PUT, `save` only for real upserts.

### ⬜ R5.7 · P3 · Delete arity and factory names

- **Where:** Delete arity (single id vs arrays), `remove`/`removeMany` vs `delete`; "new template" factories (`getNew`, `getNewCategory`, `getNewAssignment`, `newPayment`, `newPublication`)
- **Problem:** Inconsistent.
- **What to do:** `delete(ids: readonly string[])`; one `new…()` pattern.

### ✅ R5.8 · P3 · Rename `STOREFRONT_*` in `browser-sessions.ts`

- **Where:** `browser-sessions.ts:15-16,42-48,69-76`
- **Problem:** `STOREFRONT_*` / `storefront*` names break the "frontend" terminology.
- **What to do:** Rename to `FRONTEND_*` / `frontend*`.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. Renamed to `FRONTEND_*` / `frontend*`.

### ✅ R5.9 · P3 · Token-manager edge cases

- **Where:** `api/auth/token-manager.ts:31-32,50-54,70-78`, `browser-sessions.ts:27`
- **Problem:** Replaced token not revoked; `signOutAll` fails on the first error; expired tokens refreshed just to revoke them; cookie cache keyed by username only.
- **What to do:** Revoke replaced; `allSettled` + `AggregateError`; skip refresh on sign-out; key cookies by username + password.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `signOutAll` tries every session (`allSettled`) before rethrowing; sign-out revokes only still-valid tokens (no refresh); the cookie cache is keyed by user name and password. Revoking a replaced token is not done: it adds code without making tests more reliable.

### ✅ R5.10 · P3 · HTTP client dead code and body checks

- **Where:** `api/http/http-client.ts:53-75`, `http-error.ts`, `graphql-error.ts:29-32`
- **Problem:** `patch()` and `header()` unused; `json`/`form`/`multipart` can be combined; header case not normalised; `HttpError` has no `method`/`url`; GraphQL error text omits `extensions.code`.
- **What to do:** Remove dead members; reject combined bodies; normalise headers; add fields and code.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `patch()` removed; `header()` is used by the GraphQL client; GraphQL error text includes `extensions.code`. Not done on purpose: rejecting combined request bodies and `method`/`url` fields on `HttpError` (the message already has both).

### ⬜ R5.11 · P3 · Client consistency

- **Where:** `pricing-client.ts:48,133,146` untyped `QueryParams` criteria; `dynamic-content-client.ts` `protected` fields and in-client `*_FIELDS`; `oauth-apps-client.ts` and `notifications.ts` skip the `FIELDS`/`WithRequired` pattern; mutable `T[]` parameters (10 clients); path literals inline in `customers`/`platform` clients; mixed relative and alias imports
- **Problem:** Inconsistent.
- **What to do:** Align with the common client pattern.
- **Partly done** (`vcst-6033`, refactoring round of 2026-10-06): Done: `DynamicContentResource` (private fields, no subclass, `NAMED_ENTITY_FIELDS` in the types), `OAuthApp` with `OAUTH_APP_FIELDS`, `PRICES_SEARCH_PATH`. Left: untyped `QueryParams` criteria in pricing, `notifications.ts` pattern, mutable `T[]` parameters, inline paths in customers/platform clients, mixed import styles.

### ✅ R5.12 · P3 · Dead types

- **Where:** Unused: `OrdersClient.getChanges`, `MemberSearchResult`, `DynamicContent*SearchResult`, `ProductAsset`, `LockMembershipRequest` (use it), duplicate re-exports of `ModuleDescriptorData` and `ChangeLogSearchResult`, `QuantityControl`/`RangeFilterType` types
- **Problem:** Dead code.
- **What to do:** Remove or use.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. Removed `OrdersClient.getChanges`, `ModulesClient.list`, unused re-exports (`MemberSearchResult`, `DynamicContent*SearchResult`, `ProductAsset`, `ContentFolderData`, `MenuLink`), the duplicate `ModuleDescriptorData`/`ChangeLogSearchResult` re-exports and the env enum types; `LockMembershipRequest` is now used.

### ✅ R5.13 · P1 · SQL Server deadlocks fail tests under parallel writes

- **Where:** `api/http/http-client.ts`
- **Problem:** Parallel deletes and creates of catalogs, contacts and completeness channels got `500` with `Transaction … was deadlocked` or "An error occurred while saving the entity changes" on SQL Server only (7 failures in 5 of 15 jobs).
- **What to do:** **Done:** `HttpClient` retries such responses up to three times (0.3 s, 1 s, 2 s) and prints a Node warning per retry; a persistent error still fails. README documents it.

### ⬜ R5.14 · P2 · Report the SQL Server deadlocks to the platform team

- **Where:** platform (Catalog, Customer, Completeness modules)
- **Problem:** Concurrent deletes deadlock and return 500 instead of being retried by the platform.
- **What to do:** File a bug with the job ids and messages from CI run 128, attempts 10–14 (3 workers, `fullyParallel: true`, 15 jobs).

---

## 6. Dataset and fixtures

### ✅ R6.1 · P2 · `requireFields` should accept `null`

- **Where:** `core/required-fields.ts:4`
- **Problem:** Accepts `T | undefined` only, which causes `?? undefined` before every GraphQL result (13+ places). `""` passes as present.
- **What to do:** Accept `T | null | undefined`; optional non-empty-string check; remove all `?? undefined`.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `requireFields` accepts `null`; `?? undefined` removed from every `requireFields` call.

### ⬜ R6.2 · P2 · Organization memberships seeded as `optional`

- **Where:** `dataset/manifest.json:165-172`
- **Problem:** `organizationMemberships` is `optional`, so every failure is only a warning.
- **What to do:** Make it idempotent (find → create) and remove `optional`.

### ✅ R6.3 · P2 · Seeder errors lack item id and body

- **Where:** `dataset/seeder.ts:49-90`
- **Problem:** Failure messages keep only `METHOD url → status`: no item id, no response body, even for optional failures.
- **What to do:** Include item id and body.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. Each seed request carries a label (`item "<id>"` or `N items`); errors start with it and keep the platform's response.

### ✅ R6.4 · P2 · Browser tests always resolve customer-account dependencies

- **Where:** `fixtures/browser.fixture.ts:34`, `customer-account.fixture.ts:53-67`
- **Problem:** Every browser test resolves `browserCustomerAccount` and therefore the platform admin client, cleanup stack, token manager and dataset, even when it returns `undefined`.
- **What to do:** Resolve the customer account only in `customer-account` mode.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `browserCustomerAccount` is a plain option (default `undefined`); specs opt in with `test.use({ browserCustomerAccount: withCustomerAccount })`. `shopperAccount` is gone.

### ✅ R6.5 · P2 · Cleanup fixture ordering

- **Where:** `fixtures/cleanup.fixture.ts:10`
- **Problem:** Only `httpClient` is guaranteed to outlive the cleanup stack; cleanups through `platformAdminHttpClient` would break if a test requested the fixtures in a different order.
- **What to do:** Also depend on `anonymousHttpClient`; then `httpClient` dependency can go.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `cleanupStack` depends on both `httpClient` and `anonymousHttpClient`.

### ⬜ R6.6 · P2 · `STORE_ID` placeholder

- **Where:** `dataset/data/manifest.json:99`
- **Problem:** Only one place uses `${ENV:STORE_ID}` while `store-acme` is hard-coded 366 times; `STORE_ID` must be `store-acme` anyway.
- **What to do:** Hard-code it there too, and document that `STORE_ID` must match the dataset.

### ✅ R6.7 · P2 · Seed setup duplication and timeouts

- **Where:** `tests/setup/seed.setup.ts:10-28`
- **Problem:** Duplicates the pages module id and re-fetches installed modules; "apply page statuses" is skipped when only `pagesContent` is re-seeded; the second test keeps the default 30 s timeout.
- **What to do:** Derive from the manifest and `resolveSeedScope`; include `pagesContent`; set a timeout on the `seed` project.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `SEED_ONLY` parsed once; skips come from the manifest through `resolveSeedScope`; page statuses also run for `pagesContent`; all seed steps get the 15-minute timeout.

### ✅ R6.8 · P3 · Dataset typing

- **Where:** `dataset/dataset.ts:27-51`, `frontend-context.ts:28,48-56`, `stock.ts:16,46`, `manifest.ts:37`, `seed-scope.ts:22-34`
- **Problem:** Casts of untyped dataset JSON spread across files; duplicated user lookup; `?? ""` fallbacks.
- **What to do:** Typed dataset accessors per manifest entity; one `findUser`; type guard for manifest names.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `Dataset` is typed per entity for the entities code reads (users, products, stores, contacts, inventories, fulfillment centers, orders); one user lookup; `isManifestItemName` type guard.

### ✅ R6.9 · P3 · Shared seeded-constants module

- **Where:** New module
- **Problem:** Seeded ids and usernames repeated across tests (R3.9, R3.10).
- **What to do:** `dataset/seeded.ts` (or constants in builders) with seeded products, configurable product + options, users, organization; derive `SEEDED_CATALOG_ID` from the dataset store.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `dataset/seeded.ts` (catalog id and name, currency, language, users, products). `SEEDED_CATALOG_ID` stays a constant instead of being derived from the dataset store.

### ✅ R6.10 · P3 · `getStoreContext`

- **Where:** `dataset/frontend-context.ts:21-26`, `fixtures/customer-account.fixture.ts:130`
- **Problem:** `getFrontendContext` needs an anonymous id even for signed-in users; the fixture calls it with `undefined` just to get the store part.
- **What to do:** Export `getStoreContext(dataset, storeId)`.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `getStoreContext(dataset, storeId)`; `customerAccountContext` takes a `StoreContext`.

### ✅ R6.11 · P3 · Cart helper duplication

- **Where:** `dataset/arrange/cart.ts:33-64,79,112-117`, `fixtures/cart.fixture.ts:32`
- **Problem:** `arrangeCart` and `arrangeDefaultCart` nearly identical; `withItems` registers the same cart removal twice; repeated shopper label fallbacks.
- **What to do:** One private helper; single registration; `describeShopper(context)`.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. `arrangeCart` and `addToDefaultCart` share one private helper; `addToDefaultCart` registers no cleanup (callers already register the default-cart removal), so `withItems` no longer removes the same cart twice; `describeShopper(context)` labels both.

### ✅ R6.12 · P3 · Fixture simplification

- **Where:** `fixtures/customer-account.fixture.ts:36-114`, `page-builder.fixture.ts:4`, `index.ts:18`, `api.fixture.ts:50-71`
- **Problem:** Nine dependencies listed twice; unused option `customerAccountOrganizationId`; page-builder fixture extends the shopper chain for nothing; redundant merges; two identical anonymous contexts per test.
- **What to do:** Simplify as described.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. Customer-account dependencies listed once (`newCustomerAccount`); `customerAccountOrganizationId` removed; `page-builder.fixture.ts` extends `api.fixture.ts`; `fixtures/index.ts` merges two tests. Not done on purpose: merging the two anonymous request contexts, which would make the signed-in client share cookie storage with the anonymous one.

### ✅ R6.13 · P3 · Builder fixes

- **Where:** Builders: `completeness.ts:13` sends the catalog id as name; `product-configuration.ts:9-16` silently skips invalid sections; three different test-address builders; `newNamedContent` unused; `ORDER_CURRENCY`/`PRICELIST_CURRENCY` duplicate "USD"; `newEmployee` repeats `newContact`; `toMemberAddressInput` copies 21 fields by hand; `searchProducts` stops at 100 silently
- **Problem:** Small correctness and duplication issues.
- **What to do:** Fix individually.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. Channel sends the catalog name; `optionOfEachSection` fails on sections it cannot fill; one `TEST_ADDRESS` source for the three address builders; `newNamedContent` removed; currency and language from `seeded.ts`; `newContact`/`newEmployee` share `newPerson`; `toMemberAddressInput` is a destructure; `searchProducts` fails when a page is full.

### ✅ R6.14 · P1 · Seeded shipping methods are not verified

- **Where:** `dataset/shipping-methods.ts`, `api/rest/clients/shipping-methods-client.ts`, `tests/setup/seed.setup.ts`
- **Problem:** In 2 of 15 jobs (PostgreSQL) FixedRate was wrong from the start: `addOrUpdateCartShipment` failed in 4 GraphQL tests and the frontend showed `$0.00` shipping. Nothing in the run said why.
- **What to do:** **Done:** a seed step "verify shipping methods" checks one active stored method per code with the seeded settings, re-applies the dataset to the existing method when it differs (logging what the platform held) and fails the seed with the platform's data if it still differs. Verified locally by setting the Ground rate to 0.

### ⬜ R6.15 · P2 · Find out why FixedRate was wrong after seeding

- **Where:** seeding of `shipping_methods/fixed_rate.json` (`PUT /api/shipping` without an `id`)
- **Problem:** The cause is unknown; one guess is a second FixedRate record next to the one the platform registers itself.
- **What to do:** When R6.14's step logs a re-apply on CI, read what the platform held; needs R8.27 for the platform log.

---

## 7. GraphQL documents

### ⬜ R7.1 · P2 · Unused operations

- **Where:** `operations/contact/delete-contact`, `contact/get-contact`, `user/delete-users` (+ fragment `identity-result`), `order/orders`, `quote/cancel-quote-request`, `shopping-list/add-bulk-item-to-shopping-list`
- **Problem:** Operations generated but never used. `cancelQuoteRequest`, own `orders` and bulk-add to a list are real coverage gaps.
- **What to do:** Add tests for the gaps (quote cancel, my orders, bulk add), delete the rest.
- **Partly done** (`vcst-6033`, refactoring round of 2026-10-06): Done: the six unused operations and the `IdentityResult` fragment are deleted and the types regenerated. Left: tests for the real gaps (quote cancel, my orders, bulk add to a list); re-add their documents with those tests.

### ⬜ R7.2 · P2 · `ValidationError` fragment

- **Where:** 8 places (`cart`, `line-item` fragments; `get-cart-validation*`, `get-cart-line-validation`, `add-bulk-items-cart` operations)
- **Problem:** The validation-error selection is written out 8 times with different fields.
- **What to do:** `ValidationError` fragment; drop `GetCartLineValidation` (subset of `GetCartValidation`).

### ⬜ R7.3 · P2 · Over-fetching

- **Where:** `fragments/configuration-line-item.graphql:5-7`, `fragments/cart-with-list.graphql:5-7`, `contact/lock-` / `unlock-organization-contact`
- **Problem:** Over-fetching: full `...Product` per configuration option (only `id` is read); full `...Cart` for the saved-for-later list; full `...Contact` from lock/unlock (then a second query reads the status).
- **What to do:** Slim selections; assert the lock status from the mutation result.

### ⬜ R7.4 · P3 · Fields never read

- **Where:** `quote` (totals), `product` (vendor), `store-info` (settings), `user` (2 fields), pickup fragments (`workingHours`, `geoLocation`)
- **Problem:** Fields never read.
- **What to do:** Remove or move to detail fragments.

### ⬜ R7.5 · P3 · Operation naming

- **Where:** Operation names
- **Problem:** `Get` prefix used in half of the operations; shopping-list operations named differently from the xAPI fields (`DeleteShoppingList` → `removeWishlist`); `GetOrganizations` reads the current user's organizations.
- **What to do:** One naming rule; rename accordingly (file names follow).

### ⬜ R7.6 · P3 · Address fragment names

- **Where:** `pickup-address` / `pickup-location-address`, `cart-address` / `member-address` fragments
- **Problem:** Identical field lists on different types with unclear names.
- **What to do:** Names that show the pairing.

### ⬜ R7.7 · P3 · `...Role` in roles-in-organization

- **Where:** `contact/get-contact-roles-in-organization.graphql:3-6`
- **Problem:** Inline `id name` instead of `...Role`.
- **What to do:** Use the fragment.

---

## 8. Configuration, tooling, CI, docs

### ⬜ R8.1 · P1 · PR quality job

- **Where:** repo root
- **Problem:** **No CI pipeline** (the old workflows were removed).
- **What to do:** Per R0.3: PR job (`npm ci`, `biome ci .`, `npm run typecheck`).

### ✅ R8.2 · P1 · Automated test run

- **Where:** `.github/workflows/auto-tests.yml`
- **Problem:** No automated test run.
- **What to do:** **Done (manual runs):** `workflow_dispatch` calls the reusable `VirtoCommerce/.github` Playwright workflow, which starts the Docker stack, writes `.env` from a secret, installs Chromium, runs the `seed` project and re-indexing, runs the chosen suites with list/JUnit/JSON/Allure reporters, publishes a failed-tests summary and uploads `report/` and `test-results/`. Nightly runs: R8.20.

### ⬜ R8.3 · P2 · Destructive-test runner

- **Where:** repo root
- **Problem:** Destructive tests have no safe runner.
- **What to do:** Opt-in job and a `test:destructive` script with `--workers=1`.

### ⬜ R8.4 · P2 · Local compose file

- **Where:** repo root
- **Problem:** No committed way to start a platform with the right modules **locally**.
- **What to do:** CI is covered by the reusable workflow's `docker-env-full` action (once R8.17 is fixed). Remaining: a local `docker-compose.yml` (or instructions pointing at the shared one) with Elasticsearch given enough memory (at least 1 GB heap / 2 GB container); link from README Prerequisites.

### ✅ R8.5 · P1 · `forbidOnly`

- **Where:** `playwright.config.ts:27`
- **Problem:** No `forbidOnly`: a committed `test.only` silently shrinks a CI run.
- **What to do:** `forbidOnly: Boolean(process.env["CI"])`; make `noFocusedTests` a Biome error.
- **Done in:** `vcst-6033`, 2026-10-06: `forbidOnly: Boolean(process.env["CI"])`.

### ⬜ R8.6 · P2 · API project timeouts

- **Where:** `playwright.config.ts:42-49`
- **Problem:** API projects use the default 30 s test timeout, equal to `REQUEST_TIMEOUT_MS`, so one slow request or sign-in retry exhausts the test.
- **What to do:** Explicit 60–90 s timeout for `restapi`/`graphql` (or derived from `requestTimeoutMs`).

### ⬜ R8.7 · P3 · Local Allure cleanup

- **Where:** `package.json`
- **Problem:** `allure-results/` is never cleaned locally, so `npm run report` mixes runs. (CI reporters are covered: the reusable action passes `--reporter=list,junit,json,allure-playwright` and starts from a clean checkout.)
- **What to do:** `clean` script / pre-test cleanup. (Meanwhile the README's Reports section shows how to delete `allure-results/` by hand.)

### ⬜ R8.8 · P2 · Unseeded-platform check locally

- **Where:** `playwright.config.ts:36-66`, README
- **Problem:** Locally, nothing detects an unseeded platform, and a bare `npx playwright test` runs `seed` alongside the tests. (CI seeds before the suites.)
- **What to do:** Exclude `seed` from bare runs; a cheap "is the dataset seeded" check with a clear message.

### ✅ R8.9 · P2 · Env validation

- **Where:** `core/env.ts:20-27`, `.env.example`
- **Problem:** Empty `ADMIN_PASSWORD=` etc. pass validation; `PAGE_SIZE` is unused (and `.env.example` says 50 while the default is 20); `SEED_ONLY` validated only in the seed test; `.env.example` has no trailing newline.
- **What to do:** `min(1)`; remove `PAGE_SIZE`; validate `SEED_ONLY` in the schema; add commented `SEED_ONLY` line.
- **Done in:** `vcst-6033`, refactoring round of 2026-10-06. Required strings are non-empty; `PAGE_SIZE` removed from env, README and `.env.example`; `.env.example` has a commented `SEED_ONLY` line and a trailing newline. `SEED_ONLY` is validated once in the seed setup (`parseSeedOnly`), not in the env schema, which would make `core` depend on the dataset manifest.

### ⬜ R8.10 · P2 · `ci` lint script

- **Where:** `package.json`
- **Problem:** No read-only lint for CI (`check` rewrites, `lint` passes on warnings).
- **What to do:** `"ci": "biome ci ."`; errors for `noFocusedTests`, `noUnusedImports`.

### ⬜ R8.11 · P2 · VS Code formatter

- **Where:** `.vscode/settings.json:12-14`
- **Problem:** TypeScript files are formatted by the built-in formatter on save, not Biome, which fights the pre-commit hook.
- **What to do:** `biomejs.biome` as TS formatter; commit `.vscode/extensions.json` (Biome, Playwright).
- **Partly done** (`vcst-6033`, refactoring round of 2026-10-06): Done: `[typescript]` uses `biomejs.biome` in `.vscode/settings.json`. Left: commit `.vscode/extensions.json` (Biome, Playwright).

### ⬜ R8.12 · P2 · Codegen env

- **Where:** `codegen-graphql.ts:11`
- **Problem:** GraphQL codegen validates the full env (passwords etc.), REST codegen only needs `BACKEND_BASE_URL`; neither honours `VERIFY_SSL=false`.
- **What to do:** Read only `BACKEND_BASE_URL`; document or handle self-signed certificates.

### ⬜ R8.13 · P3 · `package.json` and `tsconfig`

- **Where:** `package.json`, `tsconfig.json`
- **Problem:** No `"private": true`; `@types/node` 26 vs `engines` 22; no `.nvmrc`; pre-commit uses `npx`; no `include` in tsconfig; `verbatimModuleSyntax` not enabled.
- **What to do:** Add/adjust; check `verbatimModuleSyntax` with the CJS/ESM mix.

### ⬜ R8.14 · P3 · Biome restrictions

- **Where:** `biome/layers.json`, `biome.json`
- **Problem:** Pages layer does not forbid `expect`/`test` from `@playwright/test`; core may import `@playwright/test`; no `vcs.defaultBranch`.
- **What to do:** Add restrictions; `defaultBranch: "dev"`.

### ⬜ R8.15 · P3 · `.gitignore`

- **Where:** `.gitignore`
- **Problem:** `.env.*`, `*.local.*`, probe/scratch folders, `*.tsbuildinfo`, IDE/OS files not ignored.
- **What to do:** Extend (keep `!.env.example`).

### ⬜ R8.16 · P3 · README and bug-report doc

- **Where:** `README.md`, `BUG-concurrent-token-sign-in-500.md`
- **Problem:** Hard-coded test counts will go stale; no note that `npm test` needs a seeded platform; project structure omits some dataset files; destructive commands lack `--workers=1`; bug report has no tracker key and its code block starts with a comment. (A CI section now exists.)
- **What to do:** Update README; file the bug, add the key, move to `docs/known-issues/`. When R8.18 is done, replace the `TS_ENV_SECRET_NAME` placeholder in the README CI section with the real secret name.
- **Partly done** (`vcst-6033`, refactoring round of 2026-10-06): Done: seed step count, seeding behaviour, project structure (`seeded.ts`, CLAUDE.md, `.claude/`), conventions and the AI-assisted workflow section. Left: hard-coded test counts, `--workers=1` for destructive runs, bug-report key and location.

### ✅ R8.17 · P1 · `backend-packages.json` for CI

- **Where:** `.github/workflows/auto-tests.yml:38`, `backend-packages.json`
- **Problem:** **Blocker for CI:** `customPackagesJsonUrl` pointed at `backend-packages.json`, which was deleted in the `dev` merge.
- **What to do:** **Done:** restored from `dev` (platform image 3.1069.0, 86 modules, PageBuilder 3.1029.0). It contains all 13 modules the dataset manifest seeds, plus the xAPI modules and Elasticsearch 8. Referenced from README (Prerequisites, Project structure, Continuous integration). Then bumped to edge: platform image 3.1074.0 and the newest release of every module from the edge feed (`vc-modules/modules_v3.json`), 27 modules changed; this matches the local platform the tests were verified against.

### ⬜ R8.18 · P1 · Env-file secret for CI

- **Where:** `.github/workflows/auto-tests.yml:44`, repository secrets
- **Problem:** `testSecretEnvFile` uses the placeholder secret `TS_ENV_SECRET_NAME`.
- **What to do:** Create the secret with the full `.env` content for CI: `STORE_ID`, `ADMIN_PASSWORD`, `USERS_PASSWORD`, `GOOGLE_MAPS_API_KEY` (required in practice, see R1.1), `VERIFY_SSL`, optionally `E2E_WORKERS`; the action overrides `BACKEND_BASE_URL`, `FRONTEND_BASE_URL` and `ADMIN_USERNAME`. Then reference the real secret name.

### ⬜ R8.19 · P2 · Default database matrix runs everything three times

- **Where:** `.github/workflows/auto-tests.yml:31-45`
- **Problem:** The reusable workflow defaults to `databaseProviders: ["sqlserver","mysql","postgres"]`, so every manual run executes the whole suite **three times**.
- **What to do:** Pass `databaseProviders: '["postgres"]'` by default and expose it as an input for full-matrix runs.

### ⬜ R8.20 · P2 · Nightly schedule

- **Where:** `.github/workflows/auto-tests.yml:4`
- **Problem:** Only `workflow_dispatch`: no scheduled run.
- **What to do:** Add a nightly `schedule` (with the default inputs) once R8.17–R8.19 are done.

### ⬜ R8.21 · P2 · Reusable workflow pinned to a feature branch

- **Where:** `.github/workflows/auto-tests.yml:32`
- **Problem:** The reusable workflow (and its `run-playwright-tests` action) is pinned to the feature branch `vcst-6033-playwright-workflow`, so any push there changes our CI.
- **What to do:** Switch to the release tag once VCST-6033 is released; the TODO comment in the file can then go.

### ⬜ R8.22 · P3 · `workers` input not exposed

- **Where:** `.github/workflows/auto-tests.yml`
- **Problem:** The reusable workflow's `workers` input is not exposed, so the worker count on CI can only change through `E2E_WORKERS` in the env secret. Destructive tests can only be enabled by editing that secret.
- **What to do:** Expose `workers` as a dispatch input (it maps to `--workers`, which only lowers parallelism); for destructive runs see R8.3.

### ✅ R8.23 · P2 · Allure report tree hides the suite

- **Where:** `allurerc.mjs` (new), `playwright.config.ts:30`
- **Problem:** Without `groupBy`, the Allure 3 report builds its tree from `titlePath`, which `allure-playwright` makes from the package name plus the path relative to each project's `testDir`. The suite (`restapi`, `graphql`, `e2e-frontend`, `e2e-backend`) is missing, and same-named folders of different suites (`cart/`, `orders/`, `catalog/`) merge.
- **What to do:** **Done:** `allurerc.mjs` groups the awesome report by `parentSuite` › `suite` › `subSuite` (project › spec file › `describe`). Used by `npm run report` and by CI's `allure generate`, which runs in the repo folder. README (Reports, Project structure) updated.

### ⬜ R8.24 · P3 · Allure test ids ignore the suite

- **Where:** `allure-playwright` (`testCaseId` / `historyId`), `playwright.config.ts` projects
- **Problem:** Ids are built from the path relative to the project's `testDir`, without the project name. Five spec files have the same relative path in two suites (`cart/cart-items`, `cart/cart-lifecycle`, `cart/cart-merge`, `catalog/product-configuration`, `orders/orders`); there are no collisions today only because the `describe` titles differ. A collision would merge two tests' history and retries.
- **What to do:** Keep `describe` titles unique per suite, or set the ids from the project name (e.g. an auto fixture calling `allure.testCaseId` / `allure.historyId` with `<project>:<relative file>#<title path>`).
- **Done when:** Two tests with the same relative path and titles in different suites get different ids.

### ⬜ R8.25 · P3 · Seed step output is not coloured on CI

- **Where:** `VirtoCommerce/.github` `actions/run-playwright-tests/action.yml` ("Seed test data" step)
- **Problem:** The seed step runs Playwright without `FORCE_COLOR`; on a non-TTY runner Playwright strips all ANSI codes, so the seeder's logger labels (`SUCCESS`, `WARN`, `ERROR`) are plain. The "Run tests" step sets `FORCE_COLOR=1` and is coloured.
- **What to do:** Add `FORCE_COLOR: '1'` to the seed step's `env:` in the shared action (branch `vcst-6033-playwright-workflow`).
- **Done when:** Seed log labels are coloured in the CI console.

### ⬜ R8.26 · P2 · CI keeps only the last suite's traces

- **Where:** `VirtoCommerce/.github` `actions/run-playwright-tests/action.yml` ("Run tests" step)
- **Problem:** Every `npx playwright test` run clears `test-results/`, and the action runs the suites one after another, so the uploaded `test-results/` has only the last suite's traces (run 127: e2e-backend only). The others survive only as attachments inside the Allure report.
- **What to do:** Pass `--output test-results/$suite` per suite in the action.
- **Done when:** The artifact has traces of failed tests of every suite.

### ⬜ R8.27 · P2 · CI artifacts lack the seed and platform logs

- **Where:** `VirtoCommerce/.github` `actions/run-playwright-tests/action.yml`
- **Problem:** The artifact has reports and traces, but not the "Seed test data" output or the platform container log, so seeding and server errors (R6.15, R5.14) cannot be investigated after the run.
- **What to do:** Save the seed step's output to `report/seed.log` and `docker logs` of the platform container to `report/platform.log`; both are uploaded with the artifact.

### ✅ R8.28 · P2 · `E2E_WORKERS` default contradicts the config and README

- **Where:** `core/env.ts` (`E2E_WORKERS: positiveInt.default(3)`), `playwright.config.ts:18`, README "Parallel e2e workers"
- **Problem:** The env default of 3 makes the config fallback (2 on CI, otherwise Playwright's default) unreachable, while the README still documents that fallback.
- **What to do:** **decision** — either 3 everywhere (drop the fallback, update the README) or the previous behaviour (drop `.default(3)`).
- **Done in:** `vcst-6033`, 2026-10-06: 3 everywhere: `e2e-frontend` uses `env.e2eWorkers` (default 3), the CI fallback is gone, README updated.

