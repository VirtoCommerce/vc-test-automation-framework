# Generate Test Coverage Report

You are generating a test coverage report for the VirtoCommerce testing module. Follow these steps precisely.

## Step 1: Determine Sprint ID and Dates

Ask the user for:
- **Sprint ID** (e.g., `26-03`) — used for the report folder and header
- **Current period start date** (e.g., `February 7, 2026`)
- **Current period end date** (e.g., `February 20, 2026`) — also the report date
- **Previous period start date**
- **Previous period end date**

## Step 2: Collect Current Test Metrics

Collect exact numbers from Playwright itself, per project: `restapi`, `graphql`, `e2e-frontend`, `e2e-backend` and `isolated`. Report `unit` on its own line as framework tests; ignore `seed`, it is setup. `--list` loads the specs and `.env` but needs no platform.

### 2a. Count Tests per Project

```shell
# bash
RUN_DESTRUCTIVE_TESTS=true npx playwright test --list --project=restapi
# PowerShell
$env:RUN_DESTRUCTIVE_TESTS = 'true'; npx playwright test --list --project=restapi; Remove-Item Env:RUN_DESTRUCTIVE_TESTS
```

`--list` prints one line per test (table-driven tests are expanded) and a `Total: N tests in M files` line. `RUN_DESTRUCTIVE_TESTS=true` is needed only for `isolated`: without it that project does not exist.

### 2b. Count Spec Files

Count `*.spec.ts` files under `tests/restapi`, `tests/graphql`, `tests/e2e/frontend`, `tests/e2e/backend` and `tests/isolated`, and `*.test.ts` under `tests/unit`.

### 2c. Count Known-Issue Tests

Known defects are listed in `dataset/known-issues.ts` and marked in tests with `await knownIssue(KNOWN_ISSUES.<name>)` (`fixtures/known-issue.ts`). A table row may carry the issue as a field (`issue: KNOWN_ISSUES.<name>`), so count the rows that carry it, not just the call sites.

- **Expected failure**: the entry has a tracker `key`. The test runs and is expected to fail.
- **Skipped (no ticket)**: the entry has no `key`. The test is skipped as `fixme`.

Bare `test.fail`, `test.fixme` or `test.skip` in a spec break the project rules; list any you find as a finding.

**Active tests** = total tests − skipped (no ticket) tests.

### 2d. Record Details

For each known-issue test: project, file, test title, the `KNOWN_ISSUES` name, its tracker key (or "none") and summary.

## Step 3: Collect Previous Period Metrics

Read the most recent report in `project-progress-report/` (create the folder if this is the first report). Its "Current State" section is the baseline. If there is no previous report, reconstruct the baseline by checking out the last commit before the current period start into a temporary worktree (`git worktree add`), copying `.env` there without printing it, running `npm ci` and repeating Step 2. Remove the worktree afterwards.

Commits before the layer rebuild used other projects, fixtures and markers (`@destructive` tags, `test.fail`). If the baseline commit predates it, compare totals only and say so in the report.

## Step 4: Analyze Git History

Use `git log --since=<start> --until=<end> --stat -- tests pages dataset api fixtures core` to find:
- New and modified spec files
- New tests (titles added), tests removed
- `knownIssue` marks added and removed, `KNOWN_ISSUES` entries added, removed or given a tracker key
- New page objects, REST clients, GraphQL documents, builders, `arrange` methods, dataset records
- Main feature areas covered

## Step 5: Calculate Derived Metrics

- **Change**: current − previous, per metric and project
- **% change**: (current − previous) / previous × 100
- **Active rate**: active / total × 100
- **Growth velocity**: new tests / days in period
- **Distribution**: share of each project in the total

## Step 6: Read Historical Data

Collect up to 3 data points (date, total tests, active tests, growth rate) from earlier reports for the trend section. With fewer reports, show what exists and say so.

## Step 7: Generate the Report

Create `project-progress-report/Sprint{SPRINT_ID}/test-coverage-report.md`:

```markdown
# Test Coverage Report - 2 Week Comparison

**Report Date:** {REPORT_DATE}
**Comparison Periods:**
- **Previous Period:** {PREV_START} - {PREV_END} (2 weeks)
- **Current Period:** {CURR_START} - {CURR_END} (2 weeks)
**Sprint:** {SPRINT_ID}

---

## Executive Summary

**Key Achievements in Current Period ({CURR_START} - {CURR_END}):**
- **+{NEW_TESTS} new tests** ({GROWTH}% growth)
- **+{NEW_FILES} new spec files**
- **{KNOWN_ISSUES_CHANGE} known-issue tests** ({DESCRIPTION})
- **Old-suite migration:** {MIGRATED} of {TOTAL} done
- **Major focus:** {FOCUS_AREAS}

---

## Current State ({REPORT_DATE})

| Project | Spec files | Tests | Expected failures | Skipped (no ticket) | Active rate |
|---|---|---|---|---|---|
| restapi | … | … | … | … | …% |
| graphql | … | … | … | … | …% |
| e2e-frontend | … | … | … | … | …% |
| e2e-backend | … | … | … | … | …% |
| isolated | … | … | … | … | …% |
| **Total** | … | … | … | … | …% |

Framework unit tests: {UNIT_TESTS} in {UNIT_FILES} files.

---

## Period Comparison

{One table per project and one for the total: Metric | Previous | Current | Change | % Change}

---

## Distribution

{Share of each project, with a short assessment of the balance between API and UI tests}

---

## What Changed

### New Spec Files
{Table: file, project, tests}

### New Infrastructure
{Page objects, REST clients, GraphQL documents, builders, arrange methods, dataset records}

### Known Issues
{KNOWN_ISSUES entries added, removed or given a tracker key, with reasons}

---

## Major Changes

{Numbered sections per feature area or reliability change, with commit hashes}

---

## Known-Issue Tests

| Project | File | Test | Issue | Tracker key | Summary |
|---|---|---|---|---|---|
{rows}

---

## Historical Trend

| Date | Total Tests | Active Tests | Growth Rate |
|---|---|---|---|
{rows}

---

## Recommendations for Next Period

{4 numbered recommendations based on the data: stabilization, growth areas, infrastructure, other}

---

*Report generated on {REPORT_DATE}*
*Data sources: `npx playwright test --list`, `dataset/known-issues.ts`, git history*
```

## Step 8: Generate HTML Presentation

Create `project-progress-report/Sprint{SPRINT_ID}/test-coverage-presentation.html`: a single self-contained page using Chart.js from `https://cdn.jsdelivr.net/npm/chart.js@4.4.7`, dark theme, slide navigation (Previous/Next buttons and arrow keys), with these slides:

1. **Title**: sprint, dates, headline metric
2. **Executive summary**: 4–6 metric cards
3. **Growth trend**: line chart of the historical data
4. **Period comparison**: grouped bar chart per project
5. **Active vs expected failures vs skipped**: stacked bar chart
6. **Distribution**: doughnut chart by project
7. **REST, GraphQL and isolated detail**: bar charts
8. **e2e detail**: bar charts for e2e-frontend and e2e-backend
9. **What changed**: cards
10. **Recommendations**: list

## Step 9: Summary

Tell the user:
- The paths of both files
- Headline metrics (total, growth, active rate)
- Notable findings or concerns (for example, known issues without a tracker key, bare `test.fail`/`test.fixme`, old-suite tests still ⬜)
