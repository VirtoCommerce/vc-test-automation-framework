# Refinements

Architecture and design refinements for this project, ordered by value for the effort. Each item says what is
wrong today, what to change, and roughly how big the change is. When an item is done, remove it from this file.
Two things are open: the end of the old suite's migration (section 1) and the known limits of the generic QA agents,
with what waits for other designs (section 2).

## 1. Left from the migration of the old suite

Every test of the old suite is ported, merged or dropped except the four below. The migration map (`TESTS.md`) was
removed once only these were left; it stays in the git history.

**Four tests waiting for a tracker key.** Each was recorded as a platform defect before checking that the defect is
real. Two of the six known issues checked in October 2026 turned out to be our own test data or intended behaviour,
so check each one first: a raw request or the UI by hand, the module source at the current version, and whether the
old test's expectation is right. Then port it with `knownIssue` and a tracker key, or as a normal test with the
right expectation, or drop it.

| Old test | What it expected | Suspected defect | Goes to |
|---|---|---|---|
| send a verification email (`platform/user-passwords.spec.ts`) | a `ConfirmationEmailNotification` entry in the notification journal | no entry appears | `tests/restapi/security/`; `UsersClient.sendVerificationEmail` is kept for it |
| reject a store without a name (`store/stores.spec.ts`) | a 4xx | the platform answers 500 | `tests/restapi/store/` |
| publishing a page shows a success toast (`page-builder/page-status.spec.ts`) | a toast on publish | no toast | `tests/e2e/backend/page-builder/page-status.spec.ts` |
| unpublishing a page shows a success toast (`page-builder/page-status.spec.ts`) | a toast on unpublish | no toast | `tests/e2e/backend/page-builder/page-status.spec.ts` |

**An open question for the platform team.** A plain `org-employee` can read the full account (email, roles,
contact id) of any user in the same organization through the GraphQL `user` query; outside the organization the
platform answers `Forbidden`. If that is intended, add a positive "a colleague's account is readable" test; if not,
add a test expecting `Forbidden`, marked as a known issue.

**Known issues, tracked in Jira.** 6 REST tests carry a `knownIssue` mark with an `issueUrl`, so they run as
expected failures linked to the ticket. Two more issues have a `failure` pattern instead: they hit whichever
test collides with another (on SQL Server only, so far in cleanup), and such a test is reported as an expected
failure of the issue. When a ticket is fixed the test passes, the run reports it, and the entry in
`known-issues.json` goes. When a ticket is closed as intended, rewrite or delete the test and drop the entry.

| Ticket | Behaviour | Owner | Tests |
|---|---|---|---|
| [VCST-6440](https://virtocommerce.atlassian.net/browse/VCST-6440) | OAuth app search ignores `keyword` and `objectIds` | Platform | 1 |
| [VCST-6441](https://virtocommerce.atlassian.net/browse/VCST-6441) | Completeness channel search ignores `keyword` and `objectIds` | CatalogPublishing | 1 |
| [VCST-6442](https://virtocommerce.atlassian.net/browse/VCST-6442) | A second page with an existing permalink is accepted | PageBuilder | 1 |
| [VCST-6444](https://virtocommerce.atlassian.net/browse/VCST-6444) | Content statistics return `-1`: enable `Content:StatisticEnabled` in CI | DevOps | 3 |
| [VCST-6509](https://virtocommerce.atlassian.net/browse/VCST-6509) | Concurrent deletes of unrelated catalogs deadlock on SQL Server | Catalog | any (cleanup) |
| [VCST-6510](https://virtocommerce.atlassian.net/browse/VCST-6510) | Concurrent deletes of unrelated contacts and organizations deadlock on SQL Server | Customer | any (cleanup) |

For VCST-6444, once devops releases the new `docker-env-full` tag, bump it in our workflow and remove
`contentStatisticNotCounted` in the same commit. Locally, add `- Content:StatisticEnabled=true` to the platform
service of the compose file.

**Resolved: "ship-to label not refreshed" was our test data.** The header kept "Select address" after a saved
address was picked, until a reload. Test customers were named like `Customer-14f6af4e`, and `updateContact`, which
saves the pick, refuses names with digits or dashes, so the pick was never saved. Contacts now get letter-only
names (`uniqueName`) and the known issue is gone. A UX note for the frontend team: when `updateContact` fails, the
frontend shows no error.

## 2. The generic QA agents: known limits, and what waits for other designs

The agents are described in the README ("Agents"). These limits are known and deferred. Each says what is open today,
what to change and where it belongs.

**Browser clicks and selects can still change data on a shared stand.** The explorer and the healer drive a browser
through a fixed list of `mcp__playwright__browser_*` tools, and the hook checks which tools and shell commands they
use, not what a click does: a click on "Delete" or a form submit is a write. What to change: a network-level guard
that refuses everything but reads to the platform for the read-only roles, and a second, read-only Playwright server
for the explorer and coverage next to the one the healer needs. Both need to know the stand's data modes and which
data the profile marks as owned, so they belong to the configuration and stand-profile designs (1.1 and 1.3). Size:
medium.

**The healer's edits inside the allowed files are checked for form, not for meaning.** The expectation guard
refuses a change outside `healerPaths`, a changed expectation and an added skip or wait. A locator in a page object
that is loosened until it matches another element, or a dataset value that an assertion reads, passes the guard and
changes what a test means. In a flow only the diff shows it, to the reviewer and to the person; the judge sees the
healer's work only in the evaluation suite. What to change: a judged healer step for areas whose `autonomy` is
`apply`, once the judge's verdicts have been compared with people's. Size: small.

**Runtime code that the code-writing agents run has the user's rights.** The expert and the healer run specs and
commands, and a spec, a page object or a seed script executes whatever it contains with the rights of the person who
started the session: files, the network and the `.env` file. The shell hook narrows what the read-only roles and the
healer may start, but not what the code they run does, and the expert's shell is not narrowed. The judge's
proof run and the evaluation worktrees run the same kind of code. What to change: run these agents in an operating
system sandbox (a container or a restricted user with no secrets in reach). Size: medium, and it depends on where the
agents are packaged.

**The judge proves a test fails for one assertion per case.** The script mutates one string or number literal on a
line of its own; everything else (bounds, regular expressions, several assertions on a line) is judged by reading. A
cheaper model for the judge is not measured yet, and a judge score that drops is only reported until its verdicts have
been checked against people's on a few releases.

**The slowdown half of the duration gate never fires.** `qa/test-duration.mts` compares a test with its previous
recorded run only when it is given a previous report, but no command passes one, and the expert overwrites
`.qa/runs/<contract-name>/report.<project>.json` on every run, so no earlier record survives. Only the budget half
(`durationBudgetMs`) works today. What to change: design a stable location for the last accepted report (for example
one the dispatcher keeps on an APPROVE) and pass it to the reviewer. Size: small, once the location is decided.

**The evaluation suite and the unit tests of `qa/` live outside this repository.** Nothing in CI runs them, and
the evaluation suite costs tokens per run. Its first run (five cases without a stand) passed the reviewer and coverage
cases and showed two planner calibration gaps: the planner asks its scope questions before writing, so a headless run
with nobody to answer writes no contract, and one case rejects a rule placed out of scope because an existing test
covers it. The expert, healer and explorer cases need a stand and have not run yet.

**What waits for the other designs of the client-adaptation stage.**

| Design | What the agents need from it | Today |
|---|---|---|
| 1.1 configuration | One configuration for `commands`, the tracker key pattern, `critical` flows, the knowledge directory, coverage weights, the flaky-run series, autonomy per area and the browser MCP server | `.qa/project.json`, whose field names are this design's proposal to 1.1, and the fixed server name `playwright` |
| 1.3 stand profile | Modules, feature flags, data modes, `owned` marks and data roles in a form agents can read | A `roles` map to dataset accounts; the stand check verifies that cleanup is registered and that nothing platform-wide changed outside `tests/isolated/`; `requiresFeatures` is not used |
| 1.4 extension points | A registry of a client's clients, page objects and `arrange` domains | A search of the repository |
| 1.4, evaluation | A synthetic client repository in the evaluation suite, and clients' own private cases | Cases run against this repository only |
| Tracker and code-host adapters | The framework's tracker command as a route, the redactor that masks text before the model, posting plans, creating tasks, publishing coverage, pipeline-failure tickets, the requirement to case map, bug history, call frequency from telemetry | Tickets and pull requests are read over the routes in `project.json`; a client's default is pasted text only |
| Packaging | Where the agents live in a client repository (a plugin or copied files), and `.claude/` and `qa/` possibly moving to the tests repository with the framework split; `@babel/parser` has to ship as a runtime dependency with `qa/`; which skills stay ours (`qa/ours-only.json`) | Everything lives in this repository, and `@babel/parser` is a dev dependency |
| CI templates | A pipeline that runs the evaluation suite before a package release | None |
