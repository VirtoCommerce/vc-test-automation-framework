---
name: review-test-code
description: "Review spec files and test infrastructure for convention compliance, isolation, correctness, coverage gaps and best practices — produces actionable feedback"
argument-hint: "<file-path-or-pattern>"
---

## Test Code Review

Check every item below and report only real issues, with line numbers.

## Review Process

### Step 1: Read the File(s)

Read each target file completely, plus what it depends on:
- The fixtures it destructures (`fixtures/*.fixture.ts`) and options it sets
- The clients, `arrange…()` helpers and builders it calls
- The page objects it uses (for e2e)
- The GraphQL documents behind the `…Document` constants it imports

### Step 2: Check Structure (every spec)

- [ ] `test`, `expect` and test options come from `@fixtures`
- [ ] `allure.feature("<Area> / <Topic>")` in `test.beforeEach` (e2e areas end with `(E2E)`)
- [ ] `test.describe("<topic> (<who>)")` per role
- [ ] Each test has `arrange:` / `act:` / `assert:` steps and all `expect`s sit in `assert:` steps (or in arrange steps that check a precondition)
- [ ] Titles say what happens in plain words
- [ ] One behavior per test; cases that differ only in data use a loop over cases
- [ ] Seeded ids and usernames from `dataset/seeded.ts`; other constants at module level in `UPPER_SNAKE_CASE`

### Step 3: Check Isolation

- [ ] Every created entity has a `cleanupStack.push` next to its creation, registered before the create when the id is known (builders set ids)
- [ ] Tests that change account state use `customerAccount`, not a seeded user
- [ ] Assertions focus on the test's own data (`toContainEqual`, `toMatchObject`, ids it created), so parallel tests cannot break them
- [ ] Global settings: own list values through `arrangeSettingValue` / `registerSettingValuesRemoval`; single values through `registerSettingRestore` in a `mode: "default"` describe; nothing other tests depend on is toggled
- [ ] Platform restarts or reloads tagged `@destructive`

### Step 4: Check Project-Specific Patterns

#### REST Specs
- [ ] Calls go through `api/rest/clients/*`; raw `httpClient` only to assert a status the client would hide
- [ ] Negative cases assert the status or that `find…()` returns `undefined`
- [ ] Security results: `expect(result.succeeded).toBe(true)` (or `toMatchObject({ succeeded: false, errors: [...] })` for negative cases)

#### GraphQL Specs
- [ ] Typed `…Document` constants; variables built from `cartScope(...)` or the account `context`
- [ ] `execute` for success paths, `executeRaw` only when asserting on `errors`
- [ ] Nullable results unwrapped with `requireFields`, `requireCart`, `lineItemFor` before asserting
- [ ] Eventually consistent reads (search index, pickup locations, addresses) wait with `expect.poll`

#### E2E Specs
- [ ] Page objects from `@pages/...`; `navigate()` instead of `page.goto`
- [ ] Only web-first assertions (`await expect(locator)…`); no `waitForTimeout`, `networkidle` or `expect(await locator.isVisible())`
- [ ] Waits for the GraphQL call an action triggers before depending on its result (`page.waitForResponse(isGraphqlMutation(...))`)
- [ ] Browser state from `user`, `withCustomerAccount`, `withItems`; UI sign-in only when sign-in is what the test checks
- [ ] Theme-dependent tests skip on `env.quantityControl`, `env.rangeFilterType`, `env.checkoutMode`
- [ ] Product links that may open a new tab are followed through the page object

#### Page Objects, Clients, Dataset Helpers
- [ ] Page objects: `readonly` locators in the constructor, `data-test-id` first, no assertions, no API calls
- [ ] Clients: `expectOk()` on every call, `jsonOrUndefined()` in `find…()`, `requireFields`/`requireEach` on results
- [ ] Builders are pure `new…()` functions; `arrange…()` helpers register their cleanup
- [ ] Nothing duplicates an existing helper, client method or page object

### Step 5: Check Code Quality

- [ ] `npm run typecheck` and `npm run check` pass on the file
- [ ] No `any`, no `!`, no floating promises, no unused imports
- [ ] Named functions are `function` declarations; arrows only inline
- [ ] No fallbacks hiding missing data (`?? ""`, `?? []`, `?? 0`, `?.` inside assertions)
- [ ] No credentials or URLs in code; `env` and seeded credentials instead
- [ ] No comments restating the code; terminology frontend / platform / platform admin

### Step 6: Check Coverage

- [ ] Happy path
- [ ] Error cases: invalid input, unauthorized role, missing entity
- [ ] Edge cases that matter: empty results, limits, special characters
- [ ] Roles: anonymous vs signed in vs admin where behavior differs
- [ ] The test fails when the feature is broken (no vacuous assertions)

## Severity Levels

### Critical (must fix before merge)
- Leaked entities or cleanup that runs only on success
- Vacuous assertions or tests without assertions
- Shared-state races (seeded user's cart, global settings without restore)
- Credentials in code
- Fixed waits or `networkidle`

### Warning (should fix)
- Literal seeded ids; duplicated helpers; layer violations
- Missing steps or assertions outside `assert:` steps
- Fallbacks hiding missing data
- UI setup where an option or helper exists

### Suggestion (nice to have)
- Splitting a large test; parameterizing repeated cases
- Missing negative or role coverage

## Output Format

```markdown
## Review: <file path>

### Summary
<1-2 sentence assessment: what's good, what needs work>

### Critical Issues
- **[line N]** <issue> — **Fix:** <specific fix>

### Warnings
- **[line N]** <issue> — **Suggestion:** <specific improvement>

### Suggestions
- <improvement idea with rationale>

### Coverage Gaps
- <missing scenario>

### Verdict
APPROVE | REQUEST_CHANGES | NEEDS_DISCUSSION
```

When reviewing several files, write one section per file, then an overall summary.
