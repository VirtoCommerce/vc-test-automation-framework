# QA Plan

**Stage 1 of 3** in the QA workflow: Plan → Implement → Review

You are orchestrating the planning stage. Spawn the `vc-qa-planner` agent to turn the request into a contract.

## Input

`$ARGUMENTS` is one of:
- a ticket key (checked against `tracker.keyPattern` in the project facts)
- a specification or documentation link
- an area of existing functionality ("cover the cart") or a gap id from the coverage report
- a plain-text requirement

An area needs the explorer's report first, and a gap needs the coverage report that holds it; when the one it needs
does not exist, say so and offer `/vc-qa-explore` or `/vc-qa-coverage` before planning. The other report is read when there
is one and does not block planning: without a coverage report the planner finds existing coverage in the specs.

## Steps

### 0. Clean Up

Run `node .claude/checks/prune.mts --fetch --yes`, which removes only finished work under `.qa/` (a contract whose
cases are all in test titles on the default branch, with its run record, verdict and observed report), and keep its
last line (`prune: …`) for the end. Show its `ask` lines to the person as one list; only on their yes run
`node .claude/checks/prune.mts --yes --include-stale`. Planning does not wait for that answer, and a `not reached` line
or a failed check never stops it.

### 1. Plan

Spawn the `vc-qa-planner` agent with the request. It reads `vc-framework-rules` and `vc-project-facts`, reads the source (a
ticket through `vc-read-ticket`), designs the case matrix with `/vc-plan-test-strategy`, asks the scope questions the
matrix leaves open, and writes `.qa/contracts/<ticket-key-or-slug>.md` with `/vc-plan-implementation`.

Relay its scope questions to the person and pass the answers back.

### 2. Check

First, when the planner replies `needs observation`, spawn `vc-qa-explorer` (read-only) with `observe <contract path>`,
then the planner with `observed <contract path> <report path>`. Cases the report lists as `not reached` (the
explorer observes as the session the browser holds, or anonymously through the probe for an API area with no page) go
to the person at once as a scope question: (a) observe at the expert's first run (it pins the value it sees and asks
for it in an amendment the person approves); (b) name another oracle source; (c) drop the case. Pass the answers to
the planner with `observed <contract path> <report path>`.

Otherwise run `node .claude/checks/contract.mts check .qa/contracts/<file>.md`. On a problem, send the line back to
the planner; do not edit the contract yourself. Lines `at first run awaits the person's approval` do not stop the
approval question; they clear once the approval line is written.

### 3. Approval

Show the contract's cases, each `observed:` oracle with its recorded value and report, its `## Observed only`
section, and every case or `observed:` part moved out as not reached, with the reason; ask one question: approve
this contract. A person's
approval is the only thing that lets `/vc-qa-implement` start; never approve for them. Record it: unless the person
wrote it, add `## Approval` with the one line `Approved: <who>, <date> (relayed: "<their reply, word for word>")`
(several lines joined with " / "), the only edit you make to the contract, then run the check again.

End with:
```
<the prune: line of step 0>
Contract: .qa/contracts/<file>.md
Approved? Run /vc-qa-implement .qa/contracts/<file>.md to build it.
```
