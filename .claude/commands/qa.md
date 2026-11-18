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
| "Do it end to end" | planner -> approval -> explorer if needed -> expert -> judge -> healer if red -> guard -> reviewer |

When the request fits two rows, say which flow you chose in one line and start it. When it fits none, ask.

## Dispatch Rules

- Each role is a fresh subagent: `qa-planner`, `qa-explorer`, `qa-coverage`, `qa-automation-expert`, `qa-judge`,
  `qa-healer`, `qa-reviewer`. Give it the request and the paths it needs (the contract, a report, a diff range,
  spec files). Never paste the previous agent's reasoning or summary.
- Send an agent only paths and the person's own words. Relay its questions to the person and pass the answers back.
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

Run `node qa/contract.mts check .qa/contracts/<file>.md`. When it does not print `ok`, send its lines back to the
planner; never edit the contract yourself.

### Approval

Show the contract's cases and its `## Observed only` section and ask one question: approve this contract. A
person's approval is the only thing that lets the expert start. Never approve for them. Only a person writes an
`Approved:` line on an amendment.

### Implement

Dispatch `qa-automation-expert` with the contract path only. It leaves its run record under `.qa/runs/<contract>/`
(`report.<project>.json` and `list.<project>.json` per project). When it stops with an amendment request, show it
to the person; after the person has written the `Approved:` line, run the contract check again and dispatch the
expert again with the same path.

### Judge

After the expert, once per contract, dispatch `qa-judge` with the role `expert`, the contract path and the changed
spec files (or the git range). The verdict is `.qa/judge/<contract-or-slug>/judge-expert.json`. Check it:

`node qa/judge-verdict.mts check .qa/judge/<contract-or-slug>/judge-expert.json expert`

- Not `ok`: send the judge the lines and have it fix its file once; never edit the verdict yourself. A second
  malformed verdict stops the flow: show the check's output to the person and wait.
- `pass`: go on to the next stage.
- `fail`: dispatch `qa-automation-expert` again, once, with the contract path only; it reads the failing verdict
  at that fixed path itself and fixes only what it names. Then judge again. A second `fail` stops the flow: show both
  verdicts to the person and wait. Never loop further.

No other role is judged in a flow.

### Heal

Before dispatching `qa-healer`, record a baseline: `git stash create`, and `HEAD` when it prints nothing. Dispatch
the healer with the failing spec files or the run record path. When it is done, run
`node qa/expectation-guard.mts --base=<baseline commit>` so only the healer's changes are judged. Exit 1 means the healer's diff changed an expectation: stop, show the finding to
the person, and do not go on to the reviewer. A product defect the healer reports is shown to the person, not
patched.

### Review

Dispatch `qa-reviewer` with the diff (or the git range) and the contract path when there is one, never the author's
summary. For "review this branch" with no contract, say so in the dispatch: the reviewer then reviews against the
framework rules and style only. Its
shell is read-only, so run `commands.typecheck` and `commands.lint` from `node qa/project-facts.mts` yourself and
report the result with the review. A failing typecheck or lint means the work is not done, whatever the verdict.
For a pull request, fetch the diff and metadata with `gh` and pass them as files.

## Output

End with what ran and what is left: the flow, the contract path, the run record counts per project with every
skip's reason, the judge verdict, the review verdict, and anything awaiting a person (an approval, an amendment, a
second judge failure, a guard finding). Say "not done" for any stage that did not run. Say "ready to commit" only
when the contract is approved, the run was done, the judge passed, the review approved and typecheck and lint are
clean.
