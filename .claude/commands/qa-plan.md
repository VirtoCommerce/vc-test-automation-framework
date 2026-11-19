# QA Plan

**Stage 1 of 3** in the QA workflow: Plan → Implement → Review

You are orchestrating the planning stage. Spawn the `qa-planner` agent to turn the request into a contract.

## Input

`$ARGUMENTS` is one of:
- a ticket key (checked against `tracker.keyPattern` in the project facts)
- a specification or documentation link
- an area of existing functionality ("cover the cart") or a gap id from the coverage report
- a plain-text requirement

An area or a gap needs the explorer's report and the coverage report first; when they do not exist, say so and offer
`/qa-explore` and `/qa-coverage` before planning.

## Steps

### 1. Plan

Spawn the `qa-planner` agent with the request. It reads `framework-rules` and `project-facts`, reads the source (a
ticket through `read-ticket`), designs the case matrix with `/plan-test-strategy`, asks the scope questions the
matrix leaves open, and writes `.qa/contracts/<ticket-key-or-slug>.md` with `/plan-implementation`.

Relay its scope questions to the person and pass the answers back.

### 2. Check

First, when the planner replies `needs observation`, spawn `qa-explorer` (read-only) with `observe <contract path>`,
then the planner with `observed <contract path> <report path>`. Cases the report lists as `not reached: needs <role>` (the explorer observes only as the session the browser holds),
and cases the planner lists as `api-only` (no page sends their request; an API-only area cannot be observed until the
observe probe exists, `REFINEMENTS.md`), go to the person at once as a scope question: (a) observe at the expert's
first green run, and confirm the value before the judge; (b) name another oracle source; (c) drop the case. Pass
the answers to the planner with `observed <contract path> <report path>`.

Otherwise run `node .claude/checks/contract.mts check .qa/contracts/<file>.md`. On a problem, send the line back to
the planner; do not edit the contract yourself. Lines `at first run awaits the person's approval` do not stop the
approval question; they clear once the approval line is written.

### 3. Approval

Show the contract's cases, each `observed:` oracle with its recorded value and report, its `## Observed only`
section, and every case or `observed:` part moved out as not reached, with the reason; ask one question: approve
this contract. A person's
approval is the only thing that lets `/qa-implement` start; never approve for them. Record it: unless the person
wrote it, add `## Approval` with the one line `Approved: <who>, <date> (relayed: "<their reply, word for word>")`
(several lines joined with " / "), the only edit you make to the contract, then run the check again.

End with:
```
Contract: .qa/contracts/<file>.md
Approved? Run /qa-implement .qa/contracts/<file>.md to build it.
```
