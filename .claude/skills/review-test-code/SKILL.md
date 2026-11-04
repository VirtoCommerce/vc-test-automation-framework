---
name: review-test-code
description: "Review spec files and test infrastructure (clients, page objects, builders, arrange, fixtures) for convention compliance, isolation, correctness, coverage gaps and best practices — produces actionable feedback"
argument-hint: "<file-path-or-pattern>"
---

## Test Code Review

Check every item below against CLAUDE.md and README "Writing tests". Report only real issues, with line numbers.

## Review Process

### Step 1: Read the Files

Read each target file completely, plus what it depends on:
- the fixtures it destructures and the options it sets (`user`, `shopperKind`);
- the clients, `arrange` methods and builders it calls;
- the page objects it uses;
- the GraphQL documents behind its `…Document` imports;
- the `KNOWN_ISSUES` entries it names.

### Step 2: Structure (every spec)

- [ ] `test`, `expect`, `knownIssue` from `@fixtures`; nothing from `@playwright/test` (except `tests/unit`).
- [ ] `allure.epic` and `allure.feature("<Area> / <Topic>")` in `test.beforeEach`; `allure.story` and
      `allure.description` in each test.
- [ ] One `test.describe("<topic> (<who>)")` per identity.
- [ ] Every phase is a `test.step("arrange: …" | "act: …" | "assert: …")`; `expect` sits in `assert:` steps, or
      in an `arrange:` step that checks a precondition.
- [ ] Titles say what happens in plain words; one behavior per test.
- [ ] No conditionals, `as` casts or helper functions; repeated cases are one table-driven test (rows may hold
      small lambdas).
- [ ] No raw selectors; constants at module level in `UPPER_SNAKE_CASE`; dataset ids as constants, other seeded
      values read through `dataset`.
- [ ] Placed by platform module (users and accounts in `security`); platform-wide changes in `tests/isolated/`.

### Step 3: Isolation and Cleanup

- [ ] Data the test changes is created with `arrange`; read-only data comes from `dataset`.
- [ ] A test that changes a customer's own state creates its own customer (`customerAccount()` or
      `shopperKind: "customer"`), never a dataset user.
- [ ] Cleanup is registered before the change: `arrange` does it; a manual create pushes the undo on `cleanup`
      before the call (the builder sets the id), or right after when the platform assigns the id.
- [ ] Undos are tolerant (the record may already be gone) and restore changed values, not only delete.
- [ ] Assertions target the test's own records (`toContain(id)`, `toMatchObject`), never a whole shared list.
- [ ] Deletions are proven by id (`find(id)` is `undefined`), not by a search.
- [ ] Store settings through `arrange.platform.storeSetting`; global settings only in `tests/isolated/`.

### Step 4: Waits and Data

- [ ] Index-backed reads wait in `arrange` or with `expect.poll(…, { timeout: INDEX_LAG_TIMEOUT_MS })`.
- [ ] No `waitForTimeout`, `networkidle`, sleeps or `expect(await locator.isVisible())`.
- [ ] Missing data fails loudly: `requireFields` / `requireDefined`, no `?? ""`, `?? []`, `?? 0`.
- [ ] Expected errors use `rejects.toBeHttpError(status, "text")` / `rejects.toBeGraphqlError("CODE")`.
- [ ] Known defects: `await knownIssue(KNOWN_ISSUES.x)` first in the test, entry in `dataset/known-issues.ts`;
      no bare `test.fail`, `test.fixme` or `test.skip`.

### Step 5: Project-Specific Checks

**REST:** calls go through `api.rest.<module>`; `api` signed in with `test.use({ user })`; security results check
`succeeded`.

**GraphQL:** typed documents; variables spread from `api.storeContext()`; `execute` for success, `executeRaw`
only to read errors or partial data; nullable results unwrapped with `requireFields` / `lineItemOf`; named carts
outside e2e.

**E2E:** page objects from the `frontend` / `pageBuilder` fixtures; data arranged through `shopper.api`; no branch
or skip on `QUANTITY_CONTROL`, `RANGE_FILTER_TYPE`, `CHECKOUT_MODE` (the page object hides them); waits on the
response an action triggers (`whenGraphql` / `whenResponse`) when the next step depends on it; new tabs followed through the
page object; UI sign-in only when sign-in is under test.

### Step 6: Infrastructure Files

- [ ] Clients: paths verified against Swagger; responses checked against a shape
      (`record` / `optionalRecord` / `records` / `results`); `find()` returns `undefined`, `get()` throws; bulk deletes by filter guard against
      an empty filter.
- [ ] Page objects: `readonly` locators built in the constructor, `data-test-id` first, settings hidden behind
      methods, no test assertions, no API calls.
- [ ] Builders: pure `newX()` functions with a client-side `id` and a `uniqueId` name.
- [ ] Arrange methods: on the right domain class, register cleanup before the change, wait for index lag where
      the data is searched.
- [ ] Fixtures: right scope (worker vs test); minimal dependencies.
- [ ] Layers respected (`biome/layers.json`); nothing duplicates an existing method.

### Step 7: Code Quality

- [ ] `npm run typecheck` and `npm run check` pass.
- [ ] No `any`, no `!`, no floating promises, no unused imports.
- [ ] Named and exported functions are `function` declarations; arrows only for inline callbacks.
- [ ] Class state in `readonly #private` fields.
- [ ] No code comments; JSDoc short and only for what the signature cannot say.
- [ ] No credentials or URLs in code.
- [ ] Wording: frontend (not storefront), platform, platform admin.

### Step 8: Coverage

- [ ] Happy path, and error cases (invalid input, unauthorized identity, missing record).
- [ ] Identities where behavior differs.
- [ ] The test fails when the feature is broken (no vacuous assertions).

## Severity Levels

**Critical (must fix):** leaked data or cleanup registered after the change; vacuous assertions or none;
shared-state races (a dataset user's cart, global settings outside `isolated`); fixed waits; credentials in code.

**Warning (should fix):** conditionals, casts or helpers in specs; raw selectors in specs; fallbacks hiding missing
data; bare `test.fail` / `test.fixme`; deletion proven by search; layer violations; duplicated methods.

**Suggestion:** splitting a large test; a table for repeated cases; missing negative or identity coverage.

## Output Format

```markdown
## Review: <file path>

### Summary
<1-2 sentences: what is good, what needs work>

### Critical Issues
- **[line N]** <issue> — **Fix:** <specific fix>

### Warnings
- **[line N]** <issue> — **Suggestion:** <specific improvement>

### Suggestions
- <idea with rationale>

### Coverage Gaps
- <missing scenario>

### Verdict
APPROVE | REQUEST_CHANGES | NEEDS_DISCUSSION
```

When reviewing several files, write one section per file, then an overall summary.
