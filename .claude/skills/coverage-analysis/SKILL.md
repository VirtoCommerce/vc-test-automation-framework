---
name: coverage-analysis
description: "Analyse the coverage of a stand: what it offers (installed modules, API operations, frontend pages), what the tests cover and skip, the gaps ranked by script, and the test-count metrics. Read-only; writes only the report under .qa/reports/"
argument-hint: "[module | page | api-area]"
---

## Coverage Analysis

Used by `qa-coverage`. The result is `.qa/reports/coverage-<yyyy-mm-dd>[-<slug>].md` with four sections. It writes no
test, no page object and no seeder; a gap is text for `qa-planner`. Read first: the skill `framework-rules`, then
`project-facts` (`node qa/project-facts.mts`). The argument limits every step to one module, page or API area.

## Step 1: Inventory (What the Stand Offers)

- **Installed modules:** the file the setup project that reads the platform's modules leaves for the run (find the
  path in the fixture that loads it). Missing file: write "installed modules not available" and treat every module as
  enabled; never run the setup project.
- **Feature flags:** from the repository's environment schema or configuration code, names and defaults only. A flag
  that switches an area off, or off its default way, is written next to the area it controls.
- **API operations:** from the generated schemas the repository holds (a GraphQL schema file, an OpenAPI document or
  the generated REST clients). One row per query, mutation or endpoint: the area it belongs to and its name. No
  schema in the repository: write "not available" and go on.
- **Frontend pages:** from the page objects, the frontend's routes where the project facts or the README say where its
  source lives, or a sitemap or menu seen with the browser. Nothing exposes them: "not available".

Each list is a short table; count and group by area when it is long.

## Step 2: Coverage (What the Tests Cover)

- Per Playwright project (Grep `name:` in the config) and area, run one command at a time:

```shell
npx --no -- playwright test --list --reporter=list --project=<project> <path>
```

  Its `Total: N tests in M files` line is the count. Use `--reporter=json` only for one project and one path, when
  skip annotations are needed: the full JSON of a large suite fills your context. Setup projects are not counted. A
  project the configuration hides behind a flag does not list: write "not listed: needs a flag", never set the flag.
- Map an operation or page to its tests by Grep of its name in the specs, clients, documents and page objects, not
  in generated code. An operation called by no test is uncovered.
- **Skipped tests:** Grep the specs for `test.skip`, `test.fixme` and `test.fail`, and read the known-issues file.
  One row each: test, project, reason, issue key or `none`. A skip without a reason breaks the framework rules: list
  it as a finding.

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
of the area; `stability` from known issues on the area (more issues, higher); `cost` from the building blocks the
planner would still have to create (a missing client, page object or data role: higher). No evidence: leave the key out.

Run `node qa/rank-gaps.mts <gaps file>`. It marks a gap critical when its name or area matches a critical flow, scores
each gap by the project's weights, and prints them highest first; a gap not enabled on the stand ranks below every
enabled one. Give the gaps ids `G1`, `G2`, ... in the printed order. In the report each is one row: id, area, surface,
name, score, and one sentence a planner can take as a task ("Cover `<name>`: the behaviour no test checks; roles
`<roles>`"), plus why it is not enabled when it is not.

## Step 4: Metrics

Counts from Step 2, not from memory:

| Project | Spec files | Tests | Expected failures | Skipped (no ticket) | Active rate |
|---|---|---|---|---|---|

- Spec files: count the `*.spec.ts` files under each project's test folder (Glob); framework unit tests on their own
  line.
- **Known-issue tests:** an entry with a tracker key is an expected failure (the test runs); an entry without one is
  skipped as `fixme`. A table row may carry the issue as a field, so count rows, not only call sites. List each:
  project, file, test, entry name, issue link or `none`.
- Active tests = total tests minus skipped (no ticket); active rate = active / total x 100.
- Distribution: each project's share of the total, with one line on the balance between API and UI tests.
- Compared with the newest earlier `.qa/reports/coverage-*.md`, when one exists: change and percent change per
  project; none: say so.

## Done

All four sections are in the report, each with its rows or `none observed`; the Gaps section keeps the script's
order; every row says where it was seen. Nothing outside `.qa/reports/` changed (`git status`).
