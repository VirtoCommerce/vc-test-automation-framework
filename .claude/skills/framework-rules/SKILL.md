---
name: framework-rules
description: "The rules of the test framework itself, the same in every repository that uses it: spec structure, data and cleanup, waits, known defects, module gating, working discipline and the order in which to read knowledge. Every agent reads this first"
---

## Framework Rules

These rules belong to the framework, not to a repository. They hold in every repository the agents work in. Style
(naming, comments, wording, formatting) is not here: it comes from the repository's own `CLAUDE.md`, linter and
formatter configuration, and neighbouring files.

**Precedence.** A framework rule beats a style rule. In a client repository the client's style beats this
repository's default style. When two framework rules seem to conflict, stop and ask; do not pick one silently.

## Working Discipline

- Think before testing. State what the behaviour is, how it can be observed and what would prove it wrong. If the
  request has two readings, ask, or name the reading you took.
- Write the simplest spec that proves the behaviour. No helper, parameter or abstraction nobody asked for.
- Change surgically. Touch only the lines the task needs, match the file around them, and mention unrelated
  problems instead of fixing them.
- Define success first, as something that can be checked: a command that passes, a count that matches, a record that
  is gone. Loop until the check passes; do not declare success from reading code.

## Reading Order for Knowledge

1. Read the knowledge snapshot first. Its directory is `knowledgeDir` in the project facts (skill `project-facts`).
   Each entry carries its capture date.
2. Call the live service (tracker, documentation, platform, frontend) only when the snapshot cannot answer, or when
   the entry's date makes it unsafe to rely on.
3. After a live call, update the snapshot with what you learned and the capture date. Never copy credentials or
   masked values into it.

## Spec Structure

- Report metadata: `allure.epic` and `allure.feature` in `test.beforeEach`; `allure.story` and `allure.description`
  in each test. One `test.describe("<topic> (<who>)")` per identity, named by role, for example `(anonymous)` or
  `(store administrator)`. The `"<topic> (<who>)"` describe format and the `arrange:` / `act:` / `assert:` step
  wording below are structural formats that belong to the framework, so they are not the "naming and wording" style
  that the repository decides.
- Every phase is a `test.step`: `"arrange: …"`, `"act: …"` or `"assert: …"`.
- No conditional logic, no `as` casts and no helper functions in specs. Repeated cases are one table-driven test whose
  rows may hold small lambdas.
- No raw selectors in specs. Add them to the page objects.
- Place a test by the platform module that owns the behaviour, not by the noun in its title.

## Layers and Imports

- Each folder imports only the folders before it in the order the repository's layer configuration declares.
  The linter enforces it; do not work around it.
- Tests import Playwright only through `@fixtures`, except unit tests.
- Generated code is never edited by hand; regenerate it.

## Data and Cleanup

- Read seeded data from the dataset; a spec may name a dataset id as a constant. Create what the test changes with
  `arrange`.
- A test that changes the acting customer's own state (cart, lists, addresses, locks) creates its own customer.
- REST administration tests run as the role the project facts name for the store administrator. A test that locks, deletes
  or changes the password of the acting user creates its own with `arrange.security.platformUser()`.
- Find records by search criteria, never by "is listed in the first N" windows.
- Register cleanup before the change. Builders give drafts a client-side `id` the platform keeps, so the undo can be
  pushed first; `cleanup.track(description, undo, change)` registers the undo and runs the change in one call.
- Prove a deletion by reading the record by id (`find(id)` is `undefined`), not by a search.
- A test that leaves data it cannot remove says why in a `leaves data` annotation.
- Respect the stand profile's data modes and `owned` marks where the profile provides them: change only data the
  profile marks as owned. Where it does not yet, register cleanup for everything created and change nothing
  platform-wide outside `tests/isolated/`.
- Tests that change platform-wide state (settings, index, restart) go to `tests/isolated/`, which runs only with
  `RUN_DESTRUCTIVE_TESTS=true`. Nothing else is allowed to change state that other tests share.

## Layers of Testing

- A UI test checks the UI. Data rules (search semantics, prices, scopes, validation) are checked once through the API.

## Waiting

- Index-backed reads lag. Wait in `arrange` through its index-wait methods, or use
  `expect.poll(…, { timeout: INDEX_LAG_TIMEOUT_MS })`. Never `waitForTimeout` or `networkidle`.

## Failing Loudly

- Missing data fails loudly: `requireFields(value, [...], label)`, never `?? ""` or `?? []`.
- A skipped test without a reason is a failure. Every skip is explained by `requiresModules`, `requiresFeatures`
  (where the repository provides it), `knownIssue` or the stand profile.

## Assertions

- Expected errors: `rejects.toBeHttpError(status, "body text")`, `rejects.toBeGraphqlError("CODE")`. A cart's totals
  adding up: `expect(cart).toHaveConsistentTotals()`.
- Never change an expected value or assertion to make a test pass against the build. A product defect is a
  `knownIssue`, not an edited expectation.

## Known Defects

- Add the entry to the repository's `known-issues.json` and its name to `KNOWN_ISSUE_NAMES`
  (`fixtures/known-issue.ts`), then start the test with `await knownIssue(KNOWN_ISSUES.x)`. With an `issueUrl` the
  test is an expected failure; without one it is skipped as `fixme`. Never a bare `test.fail` or `test.fixme`.
- A defect that can hit any test (a deadlock between parallel deletes) gets a `failure` pattern instead; a test whose
  every error matches one is an expected failure. `tests` patterns mark tests without editing them, for a partner's
  own file: their CI replaces `known-issues.json`.

## Optional Modules

- A test that needs an optional module declares `test.use({ requiresModules: [MODULES.x] })` (`@dataset/modules`)
  on its `describe` and is skipped where the module is missing or outside its version range (`minVersion` inclusive,
  `beforeVersion` exclusive). The seed manifest uses the same `MODULES` entries.
- Keep that module's GraphQL fields out of shared fragments.

## Example from this repository

- Our describe identities: `(anonymous)`, `(store administrator)`, `(customer of their own)`.
- Our index-wait methods in `arrange`: `searchableMemberships`, `pickupLocations`, `cartPickupLocations`,
  `productPickupLocations`, `lockMemberships`.
- Place by module: users and accounts are `security`, not `customer`.
- Our layer order is in `biome/layers.json`; the table is in `CLAUDE.md` "Layers".
