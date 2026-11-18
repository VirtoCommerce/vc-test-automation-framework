---
name: heal-tests
description: "Heal failing or flaky specs: reproduce, classify each failure (test defect, product defect, stand data, flaky), fix only test-side defects within the area's autonomy, at most three rounds, write the heal report and the flaky list, finish with the expectation guard"
argument-hint: "<spec-file | test-title | .qa/runs/<contract>/>"
---

## Heal Tests

Used by `qa-healer`. Read first: the skill `framework-rules`, then `project-facts` (`node qa/project-facts.mts`).
The rule above all others: **an expected value or an assertion never moves toward what the build does.** A failure
that can only be made green by changing one is a product defect, and it stays red.

## Step 1: Target, Slug, Baseline

- The target is a spec file, a test title or a run record folder. For a run record, the failing tests are what
  `node qa/reconcile-run.mts <list.json> <report.json>` prints under `failures`. No target: stop and say so.
- `<slug>` is the target in lower case letters, digits and hyphens. Create `.qa/runs/heal-<slug>/` (git-ignored).
- Record your own starting point: `git stash create`, or `HEAD` when it prints nothing. Save the printed commit in
  `.qa/runs/heal-<slug>/baseline.txt`. It changes no file; it is what the guard in step 7 compares against, so that
  work somebody left uncommitted before you started is not counted as yours.
- Find the Playwright project of each test: `npx playwright test --list --reporter=json <spec>` names it per test.
  Run a command only for projects named in `commands.test`.

## Step 2: Reproduce

For each project, run the failing tests with the JSON reporter, taking the command from `commands.test["<project>"]`
(`--` before arguments for an npm script, none for a direct `playwright test` command):

```shell
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-<slug>/round-0.<project>.json <command> <spec> -g "<title>" --reporter=list,json
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-<slug>/list.<project>.json npx playwright test --list --reporter=json <spec> -g "<title>"
node qa/reconcile-run.mts .qa/runs/heal-<slug>/list.<project>.json .qa/runs/heal-<slug>/round-0.<project>.json
```

Set the variable the way the shell does it. Do not hand-edit either JSON file. Everything `reconcile-run` lists under
`failures` (failed, flaky, missing from the report, skipped without a reason) is a failure to classify. A stand that
does not answer: report "not done" and stop; write no run record by hand.

## Step 3: Classify Every Failure

Read the failure's message, the error context and trace under `test-results/`, the spec, and what it calls. Then:

| Evidence | Class |
|---|---|
| A locator found nothing or too much, and the snapshot shows the element under another test id, role or text | test defect (locator) |
| The element or record exists but appears later than the test looks (an index lag, an animation, a request still in flight) | test defect (wait) |
| A builder, dataset id or `arrange` call produces an invalid or removed record; setup or cleanup throws | test defect (data) |
| An `expect` mismatch, or an expected-error check that sees another status | product defect, unless the expectation's own source (the oracle, the contract) shows the expectation is stale: then do not edit it either, escalate to the person |
| A 5xx, a GraphQL error or a console error for a valid request | product defect |
| A seeded record, account, module or setting the test needs is missing or changed on the stand | stand data |
| It passed and failed in the same series (step 4) | flaky |

An assertion failure is never "healed". Write down, for each failure, the evidence you saw (message line, snapshot
fact, status code) and the class. When two classes fit, take the stricter reading: product defect over test defect.

## Step 4: The Flaky Series

A failure is called flaky only from a series, never from a single re-run. For the tests whose first run failed in a
way that could be intermittent (a timeout, a wait, an order), and for any test the person named as flaky, run
`facts.flakyRunSeries` times per project:

```shell
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-<slug>/series.<project>.json <command> <spec> -g "<title>" --repeat-each=<flakyRunSeries> --retries=0 --reporter=list,json
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-<slug>/series-list.<project>.json npx playwright test --list --reporter=json <spec> -g "<title>" --repeat-each=<flakyRunSeries>
node qa/reconcile-run.mts .qa/runs/heal-<slug>/series-list.<project>.json .qa/runs/heal-<slug>/series.<project>.json
```

Count the entries under `failures` against `expected`. Every run failed: deterministic, not flaky; classify it by
step 3. None failed: not reproduced; change nothing, list it in the flaky list as "not reproduced in <n> runs". Some
failed and some passed: flaky. Update `.qa/reports/flaky.md` (format below), and fix it only if you can name a
test-side cause (a missing wait, shared data between tests) and the area's autonomy allows it.

## Step 5: Fix

Only a test defect, within the area's autonomy:

- The area is the first key of `autonomy` other than `*` that equals a directory name in the spec's path or a word of
  its `allure.epic` / `allure.feature`. No such key: `autonomy["*"]`. Two keys match: the more restrictive, `propose`.
  An area named in `critical` with no key of its own is `propose`.
- `apply`: make the fix. `propose`: edit nothing; the report holds the exact change as a diff.
- A locator is fixed in the page object (selector priority: `framework-rules`, `create-ui-layer` "Locator
  Conventions"), never inline in the spec. A lagging read is fixed with an `arrange` index-wait or
  `expect.poll(…, { timeout: INDEX_LAG_TIMEOUT_MS })`. Never `waitForTimeout`, `networkidle`, a raised retry count,
  a blanket timeout, a skip, `fixme` or an annotation that hides the failure.
- Do not touch an `expect` line, a matcher argument, an `assert:` step or an expected value, even to rename a locator
  inside it. If the fix needs one, the fix is not yours: escalate it.
- A product defect: add a `knownIssue` proposal to the report and edit nothing. The entry shows the name for
  `KNOWN_ISSUES`, `summary`, and a `failure` pattern or the test; `issueUrl` is left for a person to fill in.

## Step 6: Re-run, at Most Three Rounds

After each applied round run the same commands as step 2 (`round-<n>.<project>.json`) and reconcile. Typecheck and
lint (`commands.typecheck`, `commands.lint`) must be clean for what you changed. A fix that makes another test red is
reverted. After round three, whatever is still red is escalated: do not start a fourth round and do not change the
class to get out of it.

## Step 7: Guard, Then Report

Run the guard against your own starting point:

```shell
node qa/expectation-guard.mts --base=<commit in .qa/runs/heal-<slug>/baseline.txt>
```

Exit 0 means no expectation changed. Exit 1 lists lines that did: undo the edit that caused each one (a finding is
your mistake, not a style matter), re-run the guard until clean, and say in the report which fix you undid. Exit 2
means the guard could not run: report it as "not checked", never as clean.

Write `.qa/reports/heal-<slug>.md`:

```
# Heal: <target>
<date> · baseline <commit> · rounds used <n> of 3 · result <passed>/<expected> per project · guard <clean | not checked>

## Failures
### <test title> (<project>)
- Class: test defect | product defect | stand data | flaky | unclassified
- Evidence: <message line, snapshot fact, status code>
- Fix: applied <file: what changed> | proposed (autonomy <mode> for <area>) <diff> | none
- Why: <why this is the right fix, or why nothing was changed>
- knownIssue proposal: <name, summary, failure pattern> (product defects only)

## Escalated
<each failure still red after round three or needing a person, with what was tried>
```

`.qa/reports/flaky.md` is one list for the repository. Keep its other rows; replace the row of the same test and
project:

```
| Test | Project | Date | Runs | Failed | First failure message | Cause or status |
|---|---|---|---|---|---|---|
```

Never put a credential, token or personal data in either file.
