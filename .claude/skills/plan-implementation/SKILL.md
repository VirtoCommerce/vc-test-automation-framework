---
name: plan-implementation
description: "Write the contract: the file at .qa/contracts/<key-or-slug>.md that holds the source, scope, case matrix, stand needs, building blocks, known issues and verification, checked by a script and approved by a person before anything is implemented"
argument-hint: "<ticket-key | spec-link | area | gap-id>"
---

## Writing the Contract

The contract is the only hand-off from the planner to the implementer: the implementer receives its path and nothing
else, and the reviewer receives it with the diff. Read `framework-rules` and `project-facts` first.

## Step 1: Start from the Matrix

Take the case matrix from `plan-test-strategy`. If it does not exist yet, run that skill first.

## Step 2: Fill the Template

Copy `contract-template.md` (next to this file) to `.qa/contracts/<ticket-key-or-slug>.md`, which is git-ignored, and
fill every section:

- **Source**: first line `ticket: <key>`, `doc: <link>`, `area: <name>` or `gap: <id>`.
- **Scope** and **Out of scope**: what is tested, and what is not and why.
- **Cases**: the matrix. Every oracle starts with `ticket:`, `doc:`, `schema:` or `observed:`; every data role is a
  role from the facts or `none`. An `observed:` part holds a value the explorer recorded and its report,
  `observed: <value> (.qa/reports/<report>.md)`; the check refuses one without (`observed: pending <what>` included)
  or whose report does not exist.
- **Observed only**: every case whose oracle is only `observed:`, marked `characterization` or `confirmed by <who>`.
- **Stand needs**: profile, required modules and flags, data roles.
- **Building blocks**: what to reuse and what to add, in dependency order, naming the existing file each addition
  follows and the skill to use. Never propose a new file when an existing one can be extended.
- **Known issues**: the entries to add or the existing ones that apply.
- **Verification**: the typecheck, lint and test commands from the facts, then the commands that run the new specs.

## Step 3: Order the Building Blocks

Build in dependency order: generated or declared interfaces first (operations, clients, types), then page objects,
then data (records, builders, arrange methods), then known issues, then specs. Every change a test makes has its
cleanup in the plan, registered before the change.

## Step 4: Check

Run `node .claude/checks/contract.mts check .qa/contracts/<file>.md`. It prints `ok <file>` or one line per problem. Fix the
contract until it passes; never edit the facts to make it pass.

## Step 5: Amendments

When implementation shows the contract is wrong, the implementer stops and adds an `## Amendments` entry. It counts
only with an `Approved: <who>, <date>` line; an unapproved amendment fails the check. The base contract's approval is
one such line under `## Approval`. Either line may end `(relayed: "<the person's words>")`. Only a person writes it,
or a session quoting the person's words verbatim; the planner and the implementer never write it.

## Example from this repository

| Artifact | Location | Pattern reference |
|---|---|---|
| GraphQL operation | `api/graphql/operations/<area>/<name>.graphql` | `api/graphql/operations/cart/add-item.graphql` |
| REST client method | `api/rest/clients/<module>-client.ts`, registered in `api/rest/rest-api.ts` | `api/rest/clients/pricing-client.ts` |
| Frontend page | `pages/frontend/pages/<area>/<name>-page.ts` and a `Frontend` factory method | `pages/frontend/pages/cart/cart-page.ts` |
| Builder | `dataset/builders/<domain>.ts` | `dataset/builders/pricing.ts` |
| Arrange method | `dataset/arrange/<domain>.ts` | `dataset/arrange/pricing.ts` |
| Seed record | `dataset/data/<collection>/*.json` | neighbouring files |
| Known defect | `known-issues.json` | existing entries |
| REST spec | `tests/restapi/<platform-module>/<topic>.spec.ts` | `tests/restapi/pricing/pricelists.spec.ts` |
| GraphQL spec | `tests/graphql/<area>/<topic>.spec.ts` | `tests/graphql/cart/cart-items.spec.ts` |
| Frontend e2e spec | `tests/e2e/frontend/<area>/<topic>.spec.ts` | `tests/e2e/frontend/cart/cart.spec.ts` |

- Order: `.graphql` documents then `npm run codegen:graphql`, REST types and clients, page objects, dataset records
  then `npm run seed`, builders, arrange methods, `known-issues.json`, specs, `REFINEMENTS.md` last.
- Skills for the implementer: `/create-graphql-layer`, `/create-rest-client`, `/create-ui-layer`,
  `/write-graphql-test`, `/write-rest-api-test`, `/write-security-test` (no session, wrong role, another customer's
  object, headers, input validation), `/write-e2e-test`.
