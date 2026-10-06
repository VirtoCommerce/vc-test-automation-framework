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

Collect exact numbers from Playwright itself, per project (`restapi`, `graphql`, `e2e-frontend`, `e2e-backend`; ignore `seed`, it is setup).

### 2a. Count Tests per Project

```shell
# PowerShell
$env:RUN_DESTRUCTIVE_TESTS = 'true'; npx playwright test --list --project=restapi; Remove-Item Env:RUN_DESTRUCTIVE_TESTS
# bash
RUN_DESTRUCTIVE_TESTS=true npx playwright test --list --project=restapi
```

`--list` prints one line per test (parameterized loops are expanded) and a `Total: N tests in M files` line. `RUN_DESTRUCTIVE_TESTS=true` includes the `@destructive` tests, which are excluded by default; count them separately with `--grep @destructive`.

### 2b. Count Spec Files

Count `*.spec.ts` files under `tests/restapi`, `tests/graphql`, `tests/e2e/frontend` and `tests/e2e/backend`.

### 2c. Count Disabled and Known-Issue Tests

Search the specs:
- `test.fixme(` — disabled tests (not run)
- `test.fail(true, …)` — known product issues: they run and pass while the issue exists
- `test.skip(` with a condition — skipped only for some environments (theme settings, missing module); report as conditional, not disabled

**Active tests** = total tests − `test.fixme` tests.

### 2d. Record Details

For each `test.fixme` and `test.fail`: file, test title, and the issue from `dataset/known-issues.ts` (tracker key and summary).

## Step 3: Collect Previous Period Metrics

Read the most recent report in `project-progress-report/` (create the folder if this is the first report). Its "Current State" section is the baseline. If there is no previous report, reconstruct the baseline by checking out the last commit before the current period start into a temporary worktree and repeating Step 2 there.

## Step 4: Analyze Git History

Use `git log --since=<start> --until=<end> --stat -- tests pages dataset api fixtures` to find:
- New and modified spec files
- New tests (titles added), tests removed
- New `test.fixme` / `test.fail` markers, and ones removed (tests re-enabled or issues fixed)
- New page objects, components, REST clients, GraphQL documents, `arrange…()` helpers
- Main feature areas covered

## Step 5: Calculate Derived Metrics

- **Change**: current − previous, per metric and project
- **% change**: (current − previous) / previous × 100
- **Active rate**: active / total × 100
- **Growth velocity**: new tests / days in period
- **Distribution**: share of each project in the total

## Step 6: Read Historical Data

Collect at least 3 data points (date, total tests, active tests, growth rate) from earlier reports for the trend section.

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
- **Major focus:** {FOCUS_AREAS}

---

## Current State ({REPORT_DATE})

| Project | Spec files | Tests | Destructive | Disabled (`fixme`) | Known issues (`fail`) | Active rate |
|---|---|---|---|---|---|---|
| restapi | … | … | … | … | … | …% |
| graphql | … | … | … | … | … | …% |
| e2e-frontend | … | … | … | … | … | …% |
| e2e-backend | … | … | … | … | … | …% |
| **Total** | … | … | … | … | … | …% |

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
{Page objects, components, REST clients, GraphQL documents, dataset helpers}

### Disabled, Re-enabled and Known Issues
{fixme/fail markers added or removed, with reasons}

---

## Major Changes

{Numbered sections per feature area or reliability change, with commit hashes}

---

## Disabled and Known-Issue Tests

| Project | File | Test | Marker | Reason |
|---|---|---|---|---|
{rows}

---

## Historical Trend

| Date | Total Tests | Active Tests | Growth Rate |
|---|---|---|---|
{at least 3 rows}

---

## Recommendations for Next Period

{4 numbered recommendations based on the data: stabilization, growth areas, infrastructure, other}

---

*Report generated on {REPORT_DATE}*
*Data sources: `npx playwright test --list`, spec file search, git history*
```

## Step 8: Generate HTML Presentation

Create `project-progress-report/Sprint{SPRINT_ID}/test-coverage-presentation.html`: a single self-contained page using Chart.js from `https://cdn.jsdelivr.net/npm/chart.js@4.4.7`, dark theme, slide navigation (Previous/Next buttons and arrow keys), with these slides:

1. **Title**: sprint, dates, headline metric
2. **Executive summary**: 4–6 metric cards
3. **Growth trend**: line chart of the historical data
4. **Period comparison**: grouped bar chart per project
5. **Active vs disabled vs known issues**: stacked bar chart
6. **Distribution**: doughnut chart by project
7. **REST and GraphQL detail**: bar charts
8. **e2e detail**: bar charts for e2e-frontend and e2e-backend
9. **What changed**: cards
10. **Recommendations**: list

## Step 9: Summary

Tell the user:
- The paths of both files
- Headline metrics (total, growth, active rate)
- Notable findings or concerns (for example, known-issue tests whose reasons have no tracker key)
