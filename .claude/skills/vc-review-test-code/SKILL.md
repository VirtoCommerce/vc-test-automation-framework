---
name: vc-review-test-code
description: "Review spec files and test infrastructure (page objects, builders, arrange, fixtures, support) for convention compliance, isolation, correctness, coverage gaps and best practices — produces actionable feedback; holds the reviewer's definition-of-done check of a contract's run"
argument-hint: "<file-path-or-pattern>"
---

## Test Code Review

Read the skill `vc-framework-rules` first, then check every item below against it (the framework's rules) and against the
repository's own style (its `CLAUDE.md`, linter configuration and neighbouring files). A framework rule beats a style
rule. Report only real issues, with line numbers.

## Review Process

### Step 1: Read the Files

Read each target file completely, plus what it depends on:
- the fixtures it destructures and the options it sets (`user`, `shopperAs`, `modules`);
- the `arrange` methods, builders and support functions it calls;
- the page objects it uses;
- the GraphQL documents behind its `…Document` imports and the generated REST types it names;
- the `MODULES` entries it gates on.

### Step 2: Structure (every spec)

- [ ] `test`, `expect` from `@fixtures`; nothing from `@playwright/test` (except unit tests).
- [ ] One `test.describe("<topic> (<who>)")` per identity; who acts is set only with `test.use` (`user`,
      `shopperAs`, `modules`), with no wrapper around it.
- [ ] Every phase is a `test.step("arrange: …" | "act: …" | "assert: …")` (`"act and assert: …"` for one call
      whose answer is the assertion); `expect` sits in `assert:` steps, or in an `arrange:` step that checks a
      precondition. No hand-written `cleanup:` steps.
- [ ] Setup in the test body through `arrange`; a `beforeEach` only for what every test of the describe shares.
- [ ] Titles say what happens in plain words, a contract case's id first (`C-01 …`); one behaviour per test.
- [ ] No conditionals or `as` casts; repeated cases are one table-driven test (rows may hold small lambdas). A read
      several tests of the file repeat is a `function` declaration at the end of the spec; one several specs need
      belongs in `support/`, setup several specs need in `arrange`.
- [ ] No raw selectors; constants at module level in `UPPER_SNAKE_CASE`; dataset ids as constants, other seeded
      values read through `dataset`.
- [ ] Placed by platform module (users and accounts in `security`); platform-wide changes in `tests/isolated/` with
      `{ tag: DESTRUCTIVE_TAG }` on the describe.

### Step 3: Isolation and Cleanup

- [ ] Data the test changes is created with `arrange`; read-only data comes from `dataset`.
- [ ] A test that changes a customer's own state uses a customer created for the test (`shopperAs: "customer"` or
      `arrange.customers.customer()`), never a dataset user.
- [ ] What the code under test creates is registered with a `…Later` method: before the act when a builder gave the
      id, right after the act when the platform assigns it, always before the first assertion.
- [ ] No teardown code in the spec (`afterEach`, `try`/`finally`); missing removal is a new `arrange` method. In a
      client suite with no `arrange` layer (`vc-framework-rules`) a `finally` that removes what the test created is the
      rule, and it must catch its own failure and annotate `leaves data`, never throw.
- [ ] Assertions target the test's own records (`toContain(id)`, `toMatchObject`), never a whole shared list.
- [ ] Deletions are proven by id (`optionalJson` returns `undefined`), not by a search.
- [ ] Store settings through `arrange.platform.storeSetting`; global settings only in `tests/isolated/`.
- [ ] A `leaves data` annotation explains every record the test cannot remove.

### Step 4: Waits and Data

- [ ] Index-backed reads wait in `arrange` or with `expect.poll(…, { timeout: INDEX_LAG_TIMEOUT_MS })`.
- [ ] No `waitForTimeout`, `networkidle`, sleeps or `expect(await locator.isVisible())`.
- [ ] Missing data fails loudly: `requireFields` / `requireDefined` / `lineItemOf`, no `?? ""`, `?? []`, `?? 0`.
- [ ] Expected errors are explicit: REST `expect(response.status).toBe(<status>)` with the reason from
      `response.text` or `errorJson`; GraphQL `rejects.toThrow("[CODE]")` or `executeRaw` with its `errors`.
- [ ] Platform defects: the test asserts the correct behaviour. A confirmed defect that fails every time is a known
      issue: `PLATFORM_DEFECT_TAG`, an `issue` annotation with the ticket URL when one exists, and
      `test.fail(true, "<ticket>: <defect>")`. No `test.fixme`, `test.skip`, retries or workarounds, no `test.fail`
      for anything else, and no expectation edited to match the build.
- [ ] Optional modules gated with `test.use({ modules: { … } })` on the describe; nothing adapted to an older
      (stable) platform, a `minVersion` raised instead.

### Step 5: Project-Specific Checks

**REST:** direct calls on `api` (`get`/`post`/`put`/`delete`), success bodies through `expectOk().json<T>()` typed
with `@rest/generated/platform.ts`; paths as module-level constants; `api` signed in with `test.use({ user })`.

**GraphQL:** typed documents from `@graphql/generated/graphql.ts`; variables spread from `shopper.storeContext`;
`execute` for success, `executeRaw` only to read errors or partial data; nullable results unwrapped with
`requireFields` / `lineItemOf`; carts and lists from `arrange.carts`.

**E2E:** page objects from the `frontend` / `pageBuilder` / `pageDesigner` fixtures; data arranged through `arrange`
as `shopper`; no branch or skip on `QUANTITY_CONTROL`, `RANGE_FILTER_TYPE`, `CHECKOUT_MODE` (the page object hides
them); waits on the response an action triggers (`whenGraphql` / `whenResponse`) when the next step depends on it; new
tabs followed through the page object; UI sign-in only when sign-in is under test; no `page.goto` unless the URL is
under test.

### Step 6: Infrastructure Files

- [ ] Page objects: one class per file in kebab case under the right `pages/` directory; `readonly` locators built in
      the constructor, the suite's test id (`getByTestId`) first, `.vc-*` classes only in `ui-kit/` and `vc-shell/`,
      settings hidden behind methods, no test assertions, no API calls, imports only Playwright and other page objects.
- [ ] Builders: pure `newX()` functions with unique values (`uniqueId`), and a client-side `id` where the platform
      keeps it.
- [ ] `arrange` methods: on the right domain, declared in its interface with a JSDoc that says what is created and
      removed, registering removal with `later` before anything else can fail, waiting for index lag where the data is
      searched; removals tolerate a record already gone; new result types exported from `arrange/index.ts`.
- [ ] Fixtures: right scope (worker or test); minimal dependencies; options only through `{ option: true }`.
- [ ] Support: small shared reads and waits; arrange waits with `pollUntil`, not loops with sleeps.
- [ ] REST calls typed with the generated types; generated files (`graphql/generated/`, `rest/generated/`) not edited
      by hand.
- [ ] Layers respected (`.biome/layers.json`; the framework never imports suite code, the suite imports the framework
      by package name); nothing duplicates an existing method.
- [ ] Framework code (`src/`): a unit test for each public behaviour; a public API change updates its concept page,
      the examples in `docs/examples/` and adds a changeset in `.changeset/`.

### Step 7: Code Quality

- [ ] The facts' `commands.typecheck` and `commands.lint` (when the facts have one) pass. The dispatcher runs them; the
      reviewer's shell is read-only, so the reviewer reports them as not checked.
- [ ] No credentials or URLs in code; secrets as `Secret`, revealed only at the call. A store id kept in one
      module-level constant is allowed.

Style comes only from the repository (its `CLAUDE.md`, linter and formatter configuration, neighbouring files). Each
item below is a finding only where the repository has such a rule; where it has none, it is not one.

- [ ] No `any`, no `!`, no floating promises, no unused imports.
- [ ] Named and exported functions are `function` declarations; arrows only for inline callbacks.
- [ ] Class state in `readonly #private` fields.
- [ ] No code comments; JSDoc short and only for what the signature cannot say.
- [ ] Wording: frontend (not storefront), platform, platform admin, directory (not folder).

### Step 8: Coverage

- [ ] Happy path, and error cases (invalid input, unauthorized identity, missing record).
- [ ] Identities where behaviour differs.
- [ ] The test fails when the feature is broken (no vacuous assertions).

## Definition of Done

Used by `vc-qa-reviewer` with a contract. Do not take the author's word for the run. The author left Playwright's
JSON report per project under `.qa/runs/<contract-name>/` (names: `vc-project-facts`, "Hand-off Paths"). For each
Playwright project in the contract's case rows, with `<specs>` the changed spec files (repo-relative) and
`<playwright>` the facts' `playwright`:

1. Make your own list of what should have run, as the stable series the author had to run
   (`quality.stableSeries` from the facts), so that every missing repetition fails the reconciliation:

   ```shell
   PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/<contract-name>/review-list.<project>.json <playwright> --no-deps --list --reporter=json --project=<project> --repeat-each=<quality.stableSeries> <specs>
   ```

2. Reconcile it with the author's report:

   ```shell
   node .claude/checks/reconcile-run.mts .qa/runs/<contract-name>/review-list.<project>.json .qa/runs/<contract-name>/report.<project>.json --contract=.qa/contracts/<contract-name>.md
   ```

   Exit 1 means not done; copy each failure (test, project, why) into Critical, missing repetitions
   included, and each `stale` file and each `differences` line that has no `deviation:` reason. A difference with a
   reason is a Warning that quotes the reason; judge whether it is one. A missing report file, a stand that was not reachable and no record, or a report you cannot read is
   also not done.
3. Do not read the author's own `list.<project>.json` as the truth: it is theirs.
4. Your read-only shell cannot run typecheck and lint, and cannot query the stand. Say in the Summary that they were
   not checked and name `commands.typecheck` and `commands.lint` (if the facts have one) for the dispatcher to run;
   report "nothing left behind" as `not checked` too, naming the removal code you read instead. A diff that is clearly
   type-unsafe (`any`, `!`, floating promises) is a finding on its own.

5. Shape and duration of every new or changed test, with `<specs>` the changed spec files and `<project>` each
   project of the run:

   ```shell
   node .claude/checks/test-shape.mts <specs>
   node .claude/checks/test-duration.mts .qa/runs/<contract-name>/report.<project>.json <project> [<previous report>]
   ```

   Give a previous report only when the brief names one. Each line either prints is a finding (a shape finding names
   `file:line`, a duration finding `file › describe › title`: find that test by its title in the spec; exit 1). It is
   **Critical** only for a test the diff adds or changes: its spec is new, or a diff hunk adds or changes a line from
   the test's first line to the end of the test call. A finding in another test of a touched file goes under
   Suggestions as "already there" and never blocks. The limits are the facts' `quality`, never
   your own. A project without a budget is judged only on the slowdown ratio.

APPROVE only when reconciliation exits 0 for every project and there is no Critical finding.

## Severity Levels

**Critical (must fix):** leaked data or removal registered after an assertion; teardown code in a spec; vacuous
assertions or none; shared-state races (a dataset user's cart, global settings outside `isolated`); fixed waits;
credentials in code; `test.fixme`, a retry or an edited expectation for a platform defect, or a `test.fail` that is not a known-issue
mark.

**Warning (should fix):** conditionals or casts in specs; raw selectors in specs; fallbacks hiding missing data; a
missing `issue` annotation where the contract names a ticket; deletion proven by search; layer violations;
duplicated methods; a test adapted to an older platform.

**NEEDS_DISCUSSION, not Critical:** a break of a framework rule that the contract itself writes as an `assumed:` line
(the person was never asked or did not answer): name the rule and the line, and let the person decide.

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

## Example from this repository

The framework's own suite, as an example and not a rule; another repository's values come from its facts and files.

- `suiteDir` is `virtocommerce`; the layer configuration is `.biome/layers.json`; the tables are in `CLAUDE.md`
  "Layers".
- Page object rules: `virtocommerce/pages/README.md`.
