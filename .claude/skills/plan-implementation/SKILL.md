---
name: plan-implementation
description: "Write the contract: the file at .qa/contracts/<key-or-slug>.md that holds the source, scope, case matrix, stand needs, building blocks, platform defects and verification, checked by a script and approved by a person before anything is implemented"
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
  `observed: <value> (.qa/reports/explore-<slug>-observed.md)`, the value exactly as the report's line
  `- <case id>: <value> (` has it (in double quotes when it holds `;`, a `|` written `\|`). The check refuses one
  without a report (`observed: pending <what>` included), and one whose report does not exist or does not hold that
  line. `observed: at first run <what>` (the person chose to observe at the expert's first run) passes only with the
  `## Approval` line, and never with `--implemented`. The expert pins the value it saw and stops with an amendment
  `A-n first-run values: <case id> = <value> (<report>)`; a `(first run)` value passes only once that entry is
  approved.
- **Observed only**: every case whose oracle is only `observed:`, marked `characterization` or `confirmed by <who>`.
- **Stand needs**: profile, required modules (with the minimum version the suite relies on) and data roles.
- **Building blocks**: what to reuse and what to add, in dependency order, naming the existing file each addition
  follows and the skill to use. Never propose a new file when an existing one can be extended.
- **Platform defects**: each case whose correct behaviour the platform is known to break, with the defect and its
  tracker link, or `no ticket yet`; `None` when there is none. Its test asserts the correct behaviour and stays
  failing, with the link as an `issue` annotation.
- **Verification**: the typecheck, lint (when the facts have one) and test commands from the facts, then the commands that run the new specs.

## Step 3: Order the Building Blocks

Build in dependency order: generated or declared interfaces first (operations, generated types), then page objects,
then data (records, builders, `arrange` methods), then specs. Every record a test creates comes from `arrange`, which
removes it after the test; data the code under test creates has its `...Later` removal in the plan, registered right
after the act.

## Step 4: Check

Run `node .claude/checks/contract.mts check .qa/contracts/<file>.md`. It prints `ok <file>` or one line per problem.
Fix the contract until it passes; never edit the facts to make it pass.

## Step 5: Amendments

When implementation shows the contract is wrong, the implementer stops and adds an `## Amendments` entry. It counts
only with an `Approved: <who>, <date>` line; an unapproved amendment fails the check. The base contract's approval is
one such line under `## Approval`. Either line may end `(relayed: "<the person's words>")`. Only a person writes it,
or a session quoting the person's words verbatim (several lines joined with " / "); the planner and the implementer
never write it.

## Example from this repository

The framework's own suite, as an example and not a rule; another repository's values come from its facts and files.

All paths are in the suite directory `virtocommerce/`.

| Artifact | Location | Pattern reference |
|---|---|---|
| GraphQL operation | `graphql/operations/<area>/<name>.graphql` | `graphql/operations/cart/add-item.graphql` |
| REST types | `rest/generated/platform.ts`, generated, never edited | `tests/restapi/security/api-keys.spec.ts` uses them |
| Frontend page | `pages/frontend/pages/<area>/<name>-page.ts` and a `Frontend` factory method | `pages/frontend/pages/cart/cart-page.ts` |
| Builder | `builders/<domain>.ts` | `builders/pricing.ts` |
| Arrange method | `arrange/<domain>.ts` | `arrange/pricing.ts` |
| Seed record | `dataset/data/<collection>/*.json` | neighbouring files |
| Optional module | `modules.ts` (`MODULES`) | existing entries |
| REST spec | `tests/restapi/<platform-module>/<topic>.spec.ts` | `tests/restapi/pricing/pricelists.spec.ts` |
| GraphQL spec | `tests/graphql/<area>/<topic>.spec.ts` | `tests/graphql/cart/cart-items.spec.ts` |
| Frontend e2e spec | `tests/e2e/frontend/<area>/<topic>.spec.ts` | `tests/e2e/frontend/cart/cart.spec.ts` |

- Order: `.graphql` documents then `npm run codegen:vc`, page objects, dataset records then `npm run seed:vc` and a
  reindex, builders, `arrange` methods, specs.
- Skills for the implementer: `/create-graphql-layer`, `/create-ui-layer`, `/write-graphql-test`,
  `/write-rest-api-test`, `/write-security-test` (no session, wrong role, another customer's object, headers, input
  validation), `/write-e2e-test`. REST calls use the generated types directly; there is no REST client layer.
