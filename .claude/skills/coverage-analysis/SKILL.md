---
name: coverage-analysis
description: "Analyse the coverage of a stand: what it offers (installed modules, API operations, frontend pages), what the tests cover and skip, the gaps ranked by script, and the test-count metrics. Read-only; writes only the report under .qa/reports/"
argument-hint: "[module | page | api-area]"
---

## Coverage Analysis

Used by `qa-coverage`. The result is `.qa/reports/coverage-<yyyy-mm-dd>[-<slug>].md` with four sections. It writes no
test, no page object and no seeder; a gap is text for `qa-planner`. Read first: the skill `framework-rules`, then
`project-facts` (`node .claude/checks/project-facts.mts`). The argument limits every step to one module, page or API
area. Before the first step run `git status --short` and keep its output: Done compares with it.

## Step 1: Inventory (What the Stand Offers)

- **Installed modules:** a file in the repository or in the run's output that lists them, where the configuration
  or the fixtures name one. None: write "installed modules not available" and treat every module as enabled; never
  run a setup project to get one.
- **Feature flags:** from the repository's environment schema or configuration code, names and defaults only. A flag
  that switches an area off, or off its default way, is written next to the area it controls.
- **API operations:** from the generated schemas the repository holds (a GraphQL schema file, an OpenAPI document or
  the generated REST types). One row per query, mutation or endpoint: the area it belongs to and its name. No
  schema in the repository: write "not available" and go on.
- **Frontend pages:** from the page objects, the frontend's routes where the project facts or the README say where its
  source lives, or a sitemap or menu seen with the browser on the frontend origin `node .claude/checks/stand.mts`
  prints: first anonymously, then signed in as `roleFor.customer` when it prints `sign-in: ready`. Each page says
  which look reached it. Nothing exposes them: "not available".

Each list is a short table; count and group by area when it is long.

## Step 2: Coverage (What the Tests Cover)

- Per Playwright project (Grep `name:` in the suite's config, `<suiteDir>/playwright.config.ts`) and area, run one
  command at a time, with `<path>` repository-relative and `<playwright>` the facts' `playwright`:

```shell
<playwright> --list --reporter=list --project=<project> <path>
```

  Its `Total: N tests in M files` line is the count. Use `--reporter=json` only for one project and one path, when
  skip annotations are needed: the full JSON of a large suite fills your context. Setup projects are not counted. A
  project the configuration hides behind a flag does not list: write "not listed: needs a flag", never set the flag.
- Map an operation or page to its tests by Grep of its name in the specs, `arrange` methods, documents and page
  objects, not in generated code. An operation called by no test is uncovered.
- **Skipped and failing-by-design tests:** Grep the specs for the `modules` option (skipped where the module is
  missing or older), for `test.skip` and `test.fixme`, and for `PLATFORM_DEFECT_TAG` (known platform defects: the
  test runs, marked `test.fail`, until the platform is fixed). One row each: test, project, reason, issue link or `none`.
  A `test.skip` or `test.fixme`, a `test.fail` without the tag, or a skip without a reason, breaks the framework rules: list it as a
  finding.

## Step 3: Gaps

A gap is one thing no test covers: an operation, an endpoint or a page flow. Write each as an entry of
`{ "gaps": [...] }` in the gaps file the agent names, fields exactly:

| Field | Value |
|---|---|
| `area` | the module or area, as step 1 names it |
| `surface` | `graphql`, `rest` or `frontend` |
| `name` | the operation, endpoint or flow |
| `critical` | true when the flow is in the facts' `critical` list |
| `enabledOnStand` | false when the module is not installed or a flag switches the area off, else true |
| `uiWithoutApi` | true when an e2e test exercises the operation's area and no API test calls the operation |
| `factors` | optional `risk`, `callFrequency`, `runFrequency`, `stability`, `cost`, each 0 to 1, only from named evidence |

Factor evidence: `callFrequency` from endpoint telemetry where the project has it; `runFrequency` from git history
of the area; `stability` from the platform defects the area's tests carry as `issue` annotations (more defects,
higher); `cost` from the building blocks the planner would still have to create (a missing document, page object,
`arrange` method or data role: higher). No evidence: leave the key out.

Run `node .claude/checks/rank-gaps.mts <gaps file>`. It marks a gap critical when its name or area matches a critical
flow, scores each gap by the project's weights, and prints them in a strict order: gaps enabled on the stand first, then
critical flows before the others (a critical gap outranks a non-critical one whatever the scores), then by score,
highest first, then by name. A gap not enabled on the stand ranks below every enabled one, critical or not. A gap with
`"tied": true` has the same enabled-on-stand, critical and score values as a neighbour, so only its name put it
before or after that neighbour: mark such rows `tied` in the report, say in one line under the table that the order
inside a tied run is alphabetical and not a priority, and never reorder them by taste. Give the gaps ids `G1`, `G2`, ... in the printed order. In the report each is one row: id, area, surface, name, score, and one
sentence a planner can take as a task ("Cover `<name>`: the behaviour no test checks; roles `<roles>`"), plus why it is
not enabled when it is not.

## Step 4: Metrics

Counts from Step 2, not from memory:

| Project | Spec files | Tests | Platform defects | Skipped | Skipped by modules | Active rate |
|---|---|---|---|---|---|---|

- Spec files: count the `*.spec.ts` files under each project's test directory (Glob). Unit tests are on their own
  lines, counted by file (Glob of `*.test.ts`): the framework's under `tests/unit/` and the suite's under
  `<suiteDir>/tests/unit/`.
- A project that needs a flag the read-only shell never sets (in this repository `isolated`, whose tests are left
  out unless `RUN_DESTRUCTIVE_TESTS` is on) does not list: leave it out of every total and say so in one line under
  the table.
- **Platform-defect tests:** a test with an `issue` annotation runs and fails until the platform is fixed. A table
  row may carry the annotation as a field, so count rows, not only call sites. List each: project, file, test,
  issue link.
- Skipped: every test that is skipped by declaration, `test.skip`, `test.fixme` or a skip annotation, whatever the
  reason. Count them from the JSON listing of Step 2 (`--reporter=json`, one project and one area at a time): a test
  whose `expectedStatus` is `skipped` is one. They are also findings in Step 2; here they are counted, not left out.
- Skipped by modules: tests the `modules` option skips on this stand. They skip at run time, so no listing shows them:
  count them only when a run's report does; otherwise 0, and say so.
- Active tests = total tests minus skipped minus skipped by modules; active rate = active / total x 100.
- Distribution: each project's share of the total, with one line on the balance between API and UI tests.
- Compared with the newest earlier report `.qa/reports/coverage-*.md`, excluding `*-gaps.md`, when one exists: change
  and percent change per project; none: say so.

Each run writes the report and one gaps working file (`<report name>-gaps.md`); the working file is never a report to
compare against.

## Done

All four sections are in the report, each with its rows, `none observed` (looked, found nothing) or `not reached: <why>`
(could not look: no schema, no role, no stand); the Gaps section keeps the script's order; every row says where it was
seen. Nothing outside `.qa/reports/` changed: `git status --short` now shows what the one you took before your first write
showed (the repository may already hold untracked or changed files, or not be under git: then say that it could not be
compared).
