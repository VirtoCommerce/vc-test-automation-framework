# QA

One entry for the whole QA workflow: `/qa <task>` picks a flow and runs it from this session. You are the
orchestrator. You dispatch each role as a fresh subagent with file paths only, never a summary of the conversation,
and you never do a role's work yourself.

`$ARGUMENTS` is the task in plain words: a ticket key, a specification or documentation link, an area ("cover the
cart"), a failing test, "review this branch", "what is not covered". Empty: ask what to do.

## Pick the Flow

| Request | Flow |
|---|---|
| A ticket, spec or feature | planner -> approval -> expert -> judge -> reviewer |
| Existing functionality with no ticket: a module, page or API area, or a gap from coverage | explorer, coverage, then planner -> approval -> expert -> judge -> reviewer |
| "Explore ...", or the plan needs selectors or endpoints nobody has mapped | explorer, then back to the flow that asked |
| A failing or flaky test | healer -> guard, then reviewer when it changed code |
| "Review this branch" | reviewer |
| "What is not covered / what next" | coverage; its gaps can be handed to the planner |
| "Do it end to end" | planner -> explorer (observe) if an `observed:` oracle is pending -> approval -> explorer if needed -> expert -> healer if red -> guard -> judge -> reviewer |

When the request fits two rows, say which flow you chose in one line and start it. When it fits none, ask. In every
flow, a contract with a pending `observed:` oracle is observed before its approval (Plan).

## Dispatch Rules

- Each role is a fresh subagent: `qa-planner`, `qa-explorer`, `qa-coverage`, `qa-automation-expert`, `qa-judge`,
  `qa-healer`, `qa-reviewer`. Give it the request and the paths it needs (the contract, a report, a diff range,
  spec files). Never paste the previous agent's reasoning or summary.
- Send an agent only paths, the person's own words and the fixed words this command names (`judge re-dispatch`,
  "no contract", `healer: <baseline tree id> <new tree id>`, `observe <contract path>`, `observed <contract path>
  <report path>`). Relay its questions to the person and pass the answers back.
- Stages run in order; one stage's output file is the next stage's input. Do not run two writers on the same files
  at once.
- A stand that is not reachable is reported as "not done", never as a pass.

## Stages

### Explore and coverage

Dispatch `qa-explorer` with the area. Dispatch `qa-coverage` for what is already tested. Both leave a report under
`.qa/reports/`; keep the paths and pass them to the planner. In an explore-only flow, show the report and stop.

### Plan

Dispatch `qa-planner` with the request (and the report paths for an area or a gap). It writes
`.qa/contracts/<ticket-key-or-slug>.md`. Relay its scope questions.

First, when the planner replies `needs observation` (its only check lines are `no recorded value`), observe before
the approval: dispatch `qa-explorer` with `observe <contract path>`. It is read-only and records every `observed:`
case in `.qa/reports/explore-<slug>-observed.md`. Then dispatch the planner with `observed <contract path> <report
path>` to copy the values in. Cases the report lists as `not reached` (the explorer observes as the session the browser holds, or
anonymously through the probe for an API area with no page) go to the person at once as a scope question: (a) observe at the expert's first run (it pins the value it sees and asks for it in an amendment the
person approves); (b) name another oracle source; (c) drop the case. Pass the answers to the planner with
`observed <contract path> <report path>`.

Otherwise run `node .claude/checks/contract.mts check .qa/contracts/<file>.md`. When it does not print `ok`, send its
lines back to the planner; never edit the contract yourself. Never ask for approval of a contract the check refuses,
except for lines `at first run awaits the person's approval`: they clear once the approval line is written.

### Approval

Show the contract's cases, each `observed:` oracle with its recorded value and report, its `## Observed only`
section, and every case or `observed:` part moved out as not reached, with the reason; ask one question: approve
this contract. A person's approval is the only thing that lets the expert start. Never approve for them. Record it:
unless the person wrote it, add `## Approval` with the one line `Approved: <who>, <date> (relayed: "<their reply,
word for word>")`, a reply of several lines joined with " / ". That line, and the same line on an amendment the
person approved, are the only edits you make to a contract, and only with the person's words to quote. Then run the
contract check again.

### Implement

The hand-off paths (`<contract-name>`, the run record, the verdict) and the stable-series commands are in the skill
`project-facts`, "Hand-off Paths".

Before the first expert dispatch of a run, move an earlier run's verdict out of the way, so it cannot steer this run:
`mv -f .qa/judge/<contract-name>/judge-expert.json .qa/judge/<contract-name>/judge-expert.previous.json` when the
first file exists. Run `node .claude/checks/contract.mts check --approved <contract path>`; when it does not print
`ok`, the contract is not approved: stop. Dispatch `qa-automation-expert` with the contract path only. It leaves
its run record under `.qa/runs/<contract-name>/`: `report.<project>.json` and `list.<project>.json` for each
project, named with the project even when there is one. When it stops with an amendment request, show it to the
person; after the amendment's `Approved:` line is written (by the person, or by you quoting them as in Approval), run
the contract check again and dispatch the expert again with the same path (not a judge re-dispatch).

In the end-to-end flow, tell an unreachable stand apart from a red run first. When the expert reported the stand as
not reachable, or a project of the contract's case rows has no `report.<project>.json`, the run is "not done, stand
unreachable": stop, tell the person, and go to neither Heal nor Judge. Otherwise reconcile each project's record with
the third command of "Hand-off Paths", with its `--contract` argument. A series the expert ran differently from the
contract's Verification needs a `deviation: <what and why>` line in `.qa/runs/<contract-name>/deviation.txt`: write it
when you ran the series yourself, and read the expert's. A `stale` list, or `differences` with no `deviation:` line, is not a run to heal: the series is stale or not the one the
contract asked for, so dispatch the expert again with the same path. Exit 1 with a verdict whose `failures` list only tests of cases under the
contract's `## Platform defects`, each failed in every repetition: the run is done with known platform defects, so
go to Judge and name them in the Output. Exit 1 with a verdict whose `failures` list any other test (failed, flaky,
skipped without a reason, missing from the report): the run is red, so go to Heal with the run record path, then to
Judge. Exit 1 with no verdict (a file it cannot read or parse): "not done"; show its line to the person and stop.
All exit 0: go to Judge.

### Heal

Before dispatching `qa-healer`, record a baseline and a fingerprint:
`node .claude/checks/expectation-guard.mts --snapshot` prints a git tree id of the working tree, untracked files
included; `node .claude/checks/expectation-guard.mts --repo-fingerprint` prints one sha of `.git/config`,
`.git/info/`, `.git/hooks/`, the directory `core.hooksPath` names and `.qa/project.json` (it only reads; it is
yours, the healer may not run it). When `--repo-fingerprint` exits non-zero or prints anything but 64 lowercase
hexadecimal characters (a configuration file under a healer path, for one), show the person "fingerprint could not
be computed:" followed by its stderr line, and do not dispatch the healer. Then store the guard recipe as the baseline
holds it:
`GIT_NO_LAZY_FETCH=1 git --no-replace-objects -c core.fsmonitor=false cat-file blob <baseline tree id>:.claude/skills/heal-tests/guard-recipe.md`
prints it; keep that text, and when it prints nothing, do not dispatch the healer. Dispatch the healer with the
failing spec files or the run record path and that baseline id. A run whose only failures are platform-defect
tests is not healed.
When it is done, run the recipe you stored word for word: its shell block with that baseline id and fingerprint,
what each outcome means, and its "After a Clean Guard" re-run. Never read
`.claude/skills/heal-tests/guard-recipe.md` from the working tree after the heal: the healer runs test code, which
can rewrite any file, the recipe included. A guard that is not clean, or a re-run that exits 1 on a project, stops
the flow before the judge and the reviewer. A product defect the healer reports is shown to the person, not
patched: its test stays failing until the platform is fixed, and the person files the ticket.

In the end-to-end flow this stage runs only when the expert's run is red, and before the judge.

### Judge

After the expert (and, in the end-to-end flow, after a clean heal), once per contract, dispatch `qa-judge` with the
role `expert`, the contract path and the expert's spec files: it judges only the expert's tests, never the healer's
page-object or data changes, which the guard checks. The verdict is `.qa/judge/<contract-name>/judge-expert.json`.
Check it:

`node .claude/checks/judge-verdict.mts check .qa/judge/<contract-name>/judge-expert.json expert`

- Not `ok`: send the judge the lines and have it fix its file once; never edit the verdict yourself. A second
  malformed verdict stops the flow: show the check's output to the person and wait.
- `pass`: go on to the reviewer.
- `fail`: dispatch `qa-automation-expert` again, once, with the contract path and the words `judge re-dispatch`; it
  reads the failing verdict at that fixed path itself and fixes only what it names. Then judge again. A second
  `fail` stops the flow: show both verdicts to the person and wait. Never loop further.

No other role is judged in a flow.

### Review

Dispatch `qa-reviewer` with the diff (or the git range) and the contract path when there is one, never the author's
summary. For "review this branch" with no contract, say so in the dispatch: the reviewer then reviews against the
framework rules and style only. After a heal whose guard ran clean, add the line
`healer: <baseline tree id> <new tree id>` (the `healed tree` the guard recipe printed). The reviewer spares only the
hunks of `git diff <baseline tree id> <new tree id>` under the healer paths from the scope rule, so an expert's own
change in a healed file stays in scope. Without a clean guard, send no such line. Its shell is read-only, so run
`commands.typecheck` and `commands.lint` (when the facts have one) from `node .claude/checks/project-facts.mts` yourself and report the result
with the review. A failing typecheck or lint means the work is not done, whatever the verdict.
For a pull request, fetch the diff and metadata with `gh` and pass them as files.

## Output

End with what ran and what is left: the flow, the contract path, the run record counts per project with every
skip's reason and every platform-defect failure with its case, the judge verdict, the review verdict, and anything
awaiting a person (an approval, an amendment, a second judge failure, a guard finding). Say "not done" for any stage
that did not run. Say "ready to commit" only when the contract is approved, the run was done, the judge passed, the
review approved and typecheck and lint (when the facts have one) are clean.
