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

Run `node qa/contract.mts check .qa/contracts/<file>.md`. On a problem, send the line back to the planner; do not edit
the contract yourself.

### 3. Approval

Show the contract's cases and its `## Observed only` section, and ask one question: approve this contract. A person's
approval is the only thing that lets `/qa-implement` start; never approve for them.

End with:
```
Contract: .qa/contracts/<file>.md
Approved? Run /qa-implement .qa/contracts/<file>.md to build it.
```
