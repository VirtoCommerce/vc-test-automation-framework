---
name: heal-tests
description: "Heal failing or flaky specs: reproduce, classify each failure (test defect, product defect, stand data, flaky), fix only test infrastructure under the healer paths (never a spec) within the area's autonomy, at most three rounds, write the heal report and the flaky list, finish with the expectation guard"
argument-hint: "<spec-file | test-title | .qa/runs/<contract-name>/>"
---

## Heal Tests

Used by `qa-healer`. Read first: the skill `framework-rules`, then `project-facts` (`node .claude/checks/project-facts.mts`).
The rule above all others: **an expected value or an assertion never moves toward what the build does.** A failure
that can only be made green by changing one is a product defect, and it stays red.

## Step 1: Target, Slug, Baseline

- The target is a spec file, a test title or a run record folder `.qa/runs/<contract-name>/`. For a run record, the
  failing tests are what this prints under `failures`, for each project whose pair of files the folder holds (the
  names are in `project-facts`, "Hand-off Paths"):
  `node .claude/checks/reconcile-run.mts .qa/runs/<contract-name>/list.<project>.json .qa/runs/<contract-name>/report.<project>.json`.
  No target: stop and say so.
- `<slug>` is the target in lower case letters, digits and hyphens. Writing `.qa/runs/heal-<slug>/baseline.txt` below
  creates the git-ignored run folder.
- A hook confines you: Write, Edit and MultiEdit work only under `facts.healerPaths`, `.qa/reports/heal-<slug>.md`,
  `.qa/reports/flaky.md` and `.qa/runs/heal-<slug>/`, never on a `.git*` name or in the folder git runs hooks from; Bash runs only the commands shown in
  this skill (git reads, `node .claude/checks/<module>.mts`, `npx --no -- playwright test` with `--project`,
  `--repeat-each`, `--retries=0`, `--reporter`, `-g`; `npx --no -- tsc --noEmit`; `npx --no -- biome check <paths>`;
  `node .claude/checks/expectation-guard.mts --base=<sha>`). `npx` always carries `--no --`: `--no` stops npm from
  fetching a package it does not find, `--` stops it from reading the tool's own flags. A refused call is final: do
  not look for a way around it, report it.
- The dispatch carries a baseline: a git tree id that `/qa` or `/qa-heal` recorded with
  `node .claude/checks/expectation-guard.mts --snapshot` before you started (working tree, untracked files included). It is what
  the guard in step 7 compares against. Without one, stop and say so. Never record or replace a baseline yourself: a
  new one would hide the changes made before it. Save the id in `.qa/runs/heal-<slug>/baseline.txt` for the report.
- You may edit only files under `facts.healerPaths`. A spec is never one of them.
- Find the Playwright project of each test: `npx --no -- playwright test --list --reporter=json <spec>` names it per test.
  Run a project only when it is a key of `commands.test`.

## Step 2: Reproduce

For each project, run the failing tests with `npx --no -- playwright test` itself (the hook refuses npm scripts), with the
project's name from `commands.test`. `-g` takes one word without quotes or spaces: join the words of a title with `.`.
The leading variable sends the JSON report to your run folder:

```shell
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-<slug>/round-0.<project>.json npx --no -- playwright test <spec> --project=<project> -g <title.words> --reporter=list,json
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-<slug>/list.<project>.json npx --no -- playwright test --list --reporter=json <spec> --project=<project> -g <title.words>
node .claude/checks/reconcile-run.mts .qa/runs/heal-<slug>/list.<project>.json .qa/runs/heal-<slug>/round-0.<project>.json
```

Set the variable the way the shell does it. Do not hand-edit either JSON file. If a project's test command in
`commands.test` does more than `playwright test --project=<project>` (it sets an environment, for instance), say so in
the report and stop: you may not run it. Everything `reconcile-run` lists under
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

What you do with each class:

| Class | What it is | You |
|---|---|---|
| Test defect | The test side is wrong: a stale locator, a missing wait, bad or stale test data, a broken setup | fix (autonomy permitting) |
| Product defect | The build contradicts a correct expectation, or answers an error to a valid request | edit nothing; `knownIssue` proposal in the report |
| Stand data | A record, module, account or setting the test needs is missing or changed on the stand | report what is missing; edit nothing |
| Flaky | Passes and fails in one series of runs with no change | decided only by the series; list it, fix only a cause you can name on the test side |

## Step 4: The Flaky Series

A failure is called flaky only from a series, never from a single re-run, one pass or one failure. For the tests
whose first run failed in a way that could be intermittent (a timeout, a wait, an order), and for any test the
person named as flaky, run `facts.flakyRunSeries` times per project:

```shell
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-<slug>/series.<project>.json npx --no -- playwright test <spec> --project=<project> -g <title.words> --repeat-each=<flakyRunSeries> --retries=0 --reporter=list,json
PLAYWRIGHT_JSON_OUTPUT_FILE=.qa/runs/heal-<slug>/series-list.<project>.json npx --no -- playwright test --list --reporter=json <spec> --project=<project> -g <title.words> --repeat-each=<flakyRunSeries>
node .claude/checks/reconcile-run.mts .qa/runs/heal-<slug>/series-list.<project>.json .qa/runs/heal-<slug>/series.<project>.json
```

Count the entries under `failures` against `expected`. Every run failed: deterministic, not flaky; classify it by
step 3. None failed: not reproduced; change nothing, list it in the flaky list as "not reproduced in <n> runs". Some
failed and some passed: flaky. Update `.qa/reports/flaky.md` (format below), and fix it only if you can name a
test-side cause (a missing wait, shared data between tests) and the area's autonomy allows it.

## Step 5: Fix

Only a test defect, within the area's autonomy:

- Any key of `autonomy` other than `*` that matches the area: it equals a directory name in the spec's path or a word
  of its `allure.epic` / `allure.feature`. One match: its value. Two or more matches: `propose`. No match: `autonomy["*"]`.
  An area named in `critical` with no key of its own is `propose`.
- `apply`: make the fix and re-run. `propose`: edit nothing; the report holds the exact change as a diff, and you
  wait.
- What a fix may change, only under `facts.healerPaths`:
  - Page objects and components: a locator that no longer matches, a missing wait for the element, the selector
    priority of `framework-rules`.
  - Data: a builder, record or `arrange` method that is stale or invalid, never a value the test asserts against.
  - Waits: `arrange` index-wait methods where a read lags behind a write; never `waitForTimeout`, `networkidle` or
    `expect.poll`.
  - Setup and cleanup that live in those folders.
- A locator is fixed in the page object (selector priority: `framework-rules`, `create-ui-layer` "Locator
  Conventions"). A lagging read is fixed in `arrange` (the dataset's index-wait methods). Never `waitForTimeout`,
  `networkidle`, `expect.poll`, a raised retry count, a blanket timeout, a skip, `fixme` or an annotation that hides
  the failure (`testInfo.skip` and `test.info().fixme` too): the guard flags each of them as an added line.
- The code you write runs with the user's rights when the tests run; the hook confines your tool calls, not that
  code. So it never reaches past the page: no `fs` or `child_process`, `require`, dynamic `import(`, `process.env`,
  file writes or spawned processes (the guard flags those as added lines too). On an untrusted stand, heal only in a
  sandbox.
- Never edit a spec, and never touch an `expect` line, a matcher argument, an `assert:` step, a helper's expected
  value or an `expected…` constant, even to rename a locator inside it. If the fix needs a spec change, it is not
  yours: write the proposed change as a diff in the report under Escalated and stop on that failure.
- A product defect: add a `knownIssue` proposal to the report and edit nothing. The entry shows the name for
  `KNOWN_ISSUES`, `summary`, and a `failure` pattern or the test; `issueUrl` is left for a person to fill in.

## Step 6: Re-run, at Most Three Rounds

After each applied round run the same commands as step 2 (`round-<n>.<project>.json`) and reconcile. Typecheck
with `npx --no -- tsc --noEmit` (it only reads) must be clean. Lint only the files you changed, in the linter's check mode and
never with a command that fixes: `commands.lint` here is `biome check --write .`, which rewrites specs and `.claude/checks/` and
would create findings, so run `npx --no -- biome check <changed files>` without `--write` (the hook refuses any flag). Fix
what it reports by hand, inside the healer paths. A fix that makes another test red is
reverted. After round three, whatever is still red is escalated: do not start a fourth round and do not change the
class to get out of it.

## Step 7: Guard, Then Report

Run the guard against the baseline you were given:

```shell
node .claude/checks/expectation-guard.mts --base=<tree id in .qa/runs/heal-<slug>/baseline.txt>
```

This is your own early check; the hook keeps you from writing `.claude/checks/`, and the dispatcher repeats it from the
baseline's own copy of `.claude/checks/`, taken with `git cat-file`, together with a fingerprint of the git configuration and
hooks (`/qa`, `/qa-heal`). It compares the working tree, untracked files included, with that tree, and reads `healerPaths` from the baseline's
`.qa/project.json`. Exit 0: every changed file is under `healerPaths`, no expectation line changed and no added line
switches a check off. Exit 1 lists `outside healer paths: <file>`, a changed expectation line, or `<file>: added <line>`:
undo the edit that caused each one (a finding is your mistake, not a style matter), re-run the guard until clean, and
say in the report which fix you undid. Any other non-zero exit means the guard could not run: report "not checked",
never clean.

**What the guard cannot see, so say it in the report and leave it to the person and the judge:** a locator or value
edit that is legal by path and line but changes meaning (`page.locator("body")` in a page object, which makes every
check on it pass), a changed builder or `arrange` default that feeds the expected value, and a compensating
computation (`price - 2`) in the dataset. For each change under `healerPaths`, the report states what the old and new
code select or compute and why the test still checks the same behaviour.

Write `.qa/reports/heal-<slug>.md`, at most 200 lines. Every failure has an entry: its class, the evidence you saw,
the fix applied or proposed (or none), and why it is the right one:

```
# Heal: <target>
<date> · baseline <tree> · rounds used <n> of 3 · result <passed>/<expected> per project · guard <clean | not checked>

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
