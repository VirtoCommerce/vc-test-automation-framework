---
name: framework-rules
description: "The rules of the test framework itself, the same in every repository that uses it: spec structure, arrange and cleanup, waits, platform defects, module gating, tests that target edge, isolated tests, working discipline and the order in which to read knowledge. Every agent reads this first"
---

## Framework Rules

These rules belong to the framework, not to a repository. They hold in every repository the agents work in: this
one and a client repository that builds its suite on `@virtocommerce/test-automation-framework`. Style (naming,
comments, wording, formatting) is not here: it comes from the repository's own `CLAUDE.md`, linter and formatter
configuration, and neighbouring files. Facts that belong to this repository's Virto Commerce suite are marked
**In this suite** and collected at the end.

**Precedence.** A framework rule beats a style rule. In a client repository the client's style beats this
repository's default style. When two framework rules seem to conflict, stop and ask; do not pick one silently.

**The suite directory.** The suite the agents work on is `suiteDir` in the project facts (skill `project-facts`).
Spec paths are repo-relative and every Playwright command on the suite is
`npx --no playwright test --config=<suiteDir> --no-deps <spec paths> --project=<name>`, without `--config` when
`suiteDir` is `.`. In this suite `suiteDir` is `virtocommerce`. `--no-deps` keeps a run from seeding the stand again:
seed once with `commands.seed` before the first run and after a change to the seed data.

## Working Discipline

- Think before testing. State what the behaviour is, how it can be observed and what would prove it wrong. If the
  request has two readings, ask, or name the reading you took.
- Write the simplest spec that proves the behaviour. No helper, parameter or abstraction nobody asked for.
- Change surgically. Touch only the lines the task needs, match the file around them, and mention unrelated
  problems instead of fixing them.
- Define success first, as something that can be checked: a command that passes, a count that matches, a record that
  is gone. Loop until the check passes; do not declare success from reading code.
- Root-cause every failure. No retries, no waits added until it passes, no case-specific workaround.

## Reading Order for Knowledge

1. Read the knowledge snapshot first. Its directory is `knowledgeDir` in the project facts (skill `project-facts`).
   Each entry carries its capture date.
2. Call the live service (tracker, documentation, platform, frontend) only when the snapshot cannot answer, or when
   the entry's date makes it unsafe to rely on.
3. After a live call, update the snapshot with what you learned and the capture date. Never copy credentials or
   masked values into it.

## Spec Structure

- `test` and `expect` come from the suite's fixtures entry (`@fixtures`), never from `@playwright/test`, except in
  unit tests.
- One `test.describe("<topic> (<who>)")` per identity: `(<a role from roles>)`, `(anonymous)`, or the name the
  repository's existing specs use for another identity; when there is none, ask the person. The `"<topic> (<who>)"`
  describe format and the step wording below are structural formats that belong to the framework, so they are not the
  "naming and wording" style that the repository decides.
- Who acts is set only with `test.use` on the describe, with the fixture options the suite declares (in this suite
  `user`, `shopperAs` and `modules`). No wrapper functions around `test.use`.
- Every phase is a `test.step`: `"arrange: …"`, `"act: …"` or `"assert: …"`; `"act and assert: …"` for one call
  whose answer is the assertion. `cleanup:` steps are not written by hand: `arrange` adds them after the test.
- Setup happens in the test body through `arrange`. A `test.beforeEach` arranges only what every test of its describe
  shares.
- No conditional logic and no `as` casts in specs. Repeated cases are one table-driven test whose rows may hold small
  lambdas.
- A read that several tests of one spec repeat may be a `function` declaration at the end of the spec, such as
  `pricelistOf(api, id)`. A read that several specs need goes to the suite's shared code (in this suite `support/`);
  setup that several specs need becomes an `arrange` method.
- No raw selectors in specs. Add them to the page objects.
- Place a test by the platform module that owns the behaviour, not by the noun in its title.

## Layers and Imports

- Imports follow the layer configuration of the repository; the linter enforces it, do not work around it. The
  framework never imports suite code, and the suite imports the framework only by its package name,
  `@virtocommerce/test-automation-framework/<area>`.
- Generated code (GraphQL documents and types, REST types) is never edited by hand; regenerate it.

## Data, `arrange` and Cleanup

- Read seeded data from the dataset; a spec may name a dataset id as a constant. Create what the test changes with
  `arrange`, which removes it after the test, last first, so tests have no teardown code.
- A test that changes the acting customer's own state (cart, lists, addresses, locks) uses a customer created for the
  test, never a dataset user.
- REST administration tests run as `roleFor.admin`, the role the project facts name for administration. A test that
  locks, deletes or changes the password of the acting user creates its own user through `arrange`.
- When the create is the action under test, register its removal with the `…Later` method of `arrange`: before the
  act when a builder gave the draft a client-side id the platform keeps, right after the act when the platform assigns
  the id, and always before the first assertion. `…Later` methods create nothing.
- Data `arrange` has no method for gets a new `arrange` method, never teardown code in the spec.
- Find records by search criteria, never by "is listed in the first N" windows. Assert on the test's own records,
  never on a whole shared list.
- Prove a deletion by reading the record by id (the read returns `undefined` or 404), not by a search.
- A test that leaves data it cannot remove says why in a `leaves data` annotation.
- Respect the stand profile's data modes and `owned` marks where the profile provides them: change only data the
  profile marks as owned. Where it does not yet, let `arrange` remove everything created and change nothing
  platform-wide outside the isolated tests.

## Isolated Tests

- Tests that change platform-wide state (global settings, store access, the search index, a restart) are the only
  tests allowed to change state that other tests share. They live in the suite's isolated directory (in this suite
  `tests/isolated/{restapi,graphql}/`, project `isolated`, one worker), and their describe carries
  `{ tag: DESTRUCTIVE_TAG }` from `@virtocommerce/test-automation-framework/core`.
- They run only when `RUN_DESTRUCTIVE_TESTS` is on, in a run of their own (in this suite `npm run test:vc:isolated`),
  never next to the other projects.
- They still change state only through `arrange` methods that restore it, and wait for the change to take effect.

## Layers of Testing

- A UI test checks the UI. Data rules (search semantics, prices, scopes, validation) are checked once through the API.

## Waiting

- Index-backed reads lag. Wait in `arrange` through its index-wait methods. In an assertion, use
  `expect.poll(…, { timeout: INDEX_LAG_TIMEOUT_MS })` or `expect(…).toPass({ timeout })`. Inside `arrange` and shared
  code, wait with `pollUntil(read, isDone, describe, timeoutMs)`.
- Never `waitForTimeout`, `networkidle` or a sleep. A browser action waits for the state or the response it causes.

## Failing Loudly

- Missing data fails loudly: `requireFields(value, [...], label)` or `requireDefined(list, label)`, never `?? ""`,
  `?? []` or `?? 0`.
- A skipped test without a reason is a failure. A test skips only through `modules` (a required module is missing or
  outside its versions) or the stand profile; never `test.skip` or `test.fixme`. `test.fail` marks only a known
  platform defect (Platform Defects).

## Assertions

- Expected HTTP errors: the client never throws on a status, so check it:
  `expect(response.status).toBe(400)` and `expect(response.text).toContain(reason)`, or `response.errorJson<T>()` to
  read the error body. Success bodies go through `expectOk().json<T>()`, which fails on any other status.
- Expected GraphQL errors: `execute` throws a `GraphqlError` whose message lists each error as `[CODE] message`, so
  `rejects.toThrow("[CODE]")`; `executeRaw` returns `data` and `errors` for partial data or several errors.
- Never change an expected value or assertion to make a test pass against the build.

## Platform Defects

- A test asserts the correct behaviour. When the platform gets it wrong, the expectation stays as it is: no edited
  expectation, no retry, no `test.fixme`, no skip and no symptom workaround.
- A new defect stays failing until a person confirms it: listed under `## Platform defects` of an approved contract,
  or confirmed in the review.
- A confirmed defect that fails every time becomes a known issue: the test gets `PLATFORM_DEFECT_TAG`, the ticket as
  an `issue` annotation when one exists, and `test.fail(true, "<ticket>: <defect>")` as the first line of its body.
  The test keeps running; it passes while the defect is there and fails as soon as the platform is fixed, which is the
  signal to remove the mark.

  ```ts
  test("anonymous visitors cannot list the coupons", {
    tag: PLATFORM_DEFECT_TAG,
    annotation: { type: "issue", description: "<tracker URL of the ticket>" },
  }, async ({ shopper }) => {
    test.fail(true, "<ticket>: anonymous visitors can list the coupons");
    …
  });
  ```

- A defect that hits whichever test runs at the moment, such as a database deadlock, cannot be marked on a test: it
  stays failing and is reported for the platform to fix.
- `test.fail` is never used for anything else, and only the expert adds it, for a confirmed defect; the healer never
  does.

- Other annotations explain facts the test cannot avoid, such as `leaves data` or `database difference`; they never
  excuse a failure.

## Optional Modules

- A test that needs an optional module, or a module version, declares it on its describe:
  `test.use({ modules: { pickup: MODULES.pickup } })`. The test is skipped where the module is missing or outside its
  range (`minVersion` inclusive, `beforeVersion` exclusive), and the skip reason names the module. The seed manifest
  uses the same `MODULES` entries, so a collection the seed skips and the tests that read it skip for the same reason.
- An inner `test.use` replaces the outer `modules`; spread them to keep both.
- Keep that module's GraphQL fields out of shared fragments.

## Tests Target Edge

- Tests are written for the edge versions of the platform and its modules. Never adapt a test or an expectation to an
  older (stable) platform. When a test relies on a newer fix or feature, raise that module's `minVersion` so older
  platforms skip it.

## Example from this repository

- Fixtures entry `virtocommerce/fixtures/index.ts` (`@fixtures`); options `user`, `shopperAs`, `modules`; module
  constants `MODULES` in `virtocommerce/modules.ts` (`@modules`), each `minVersion` the edge version the suite is
  proven on.
- Describe identities: `(anonymous)`, `(store administrator)` (our `roleFor.admin`, `user: STORE_ADMINISTRATOR`),
  `(customer of their own)` for `shopperAs: "customer"` or `arrange.customers.customer()`, `(signed-in customer)`
  for a dataset shopper, and `(platform admin)` for the admin UI signed in as `ADMINISTRATOR`.
- `arrange` domains: `customers`, `carts`, `orders`, `catalog`, `pickup`, `content`, `platform`, `mailbox`,
  `security`, `pricing`, `marketing` (`virtocommerce/arrange/`). Index-wait methods:
  `arrange.customers.searchableMemberships`, `arrange.customers.lockMemberships`, `arrange.pickup.pickupLocations`,
  `cartPickupLocations`, `productPickupLocations`.
- `requireFields`, `requireDefined` (`@support/require-fields.ts`), `pollUntil`, `INDEX_LAG_TIMEOUT_MS`
  (`@support/poll.ts`); `expect(cart).toHaveConsistentTotals()` from `@fixtures`.
- Place by module: users and accounts are `security`, not `customer`.
- Layers: `.biome/layers.json`; the tables are in `CLAUDE.md` "Layers".
