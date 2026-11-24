---
name: plan-test-strategy
description: "Analyse a ticket card, a spec or documentation page, an area of existing functionality or a coverage gap and design the case matrix: one formal technique per acceptance criterion or documented rule, plus edge, negative and regression cases, each with its project, data role and oracle source"
argument-hint: "<ticket-key | spec-link | area | gap-id>"
---

## Test Strategy Planning

Given a source, design the case matrix that `plan-implementation` writes into the contract. Read the skill
`framework-rules` and `project-facts` first; the project names, roles and critical flows come from the facts, never
from this file.

## Step 1: Understand the Source

- A ticket: read only its card (skill `read-ticket`). The acceptance criteria are the card's list. When the value is
  `"none found"` there are none: say so and take the expected behaviour from the documentation and the schema.
- A specification or documentation page: each documented rule is one criterion.
- An area of existing functionality or a gap, with no ticket: the criteria are the documented rules found in
  `docSources`, the API schema, and what the explorer's report observed. Read the coverage report to see what is
  already tested.
- Note the surfaces involved (API operations, endpoints, pages) and the identities (roles from the facts, anonymous).

## Step 2: Explore Existing Coverage

Search the repository's test directories and its documentation (README, `CLAUDE.md`) before planning anything new:
specs already covering a criterion, and the building blocks that exist (documents, generated types, page objects,
`arrange` methods, builders, dataset records), and the platform defects existing tests carry as `issue` annotations.
A criterion already covered is listed as covered, not planned again.

## Step 3: Design the Cases

1. For each acceptance criterion or documented rule choose one formal technique:
   - equivalence partitioning: one case per class of input that the rule treats differently;
   - boundary value analysis: the values on and next to each limit;
   - decision table: combinations of conditions that lead to different outcomes;
   - state transition: each allowed and each forbidden move between states;
   - pairwise: the interacting parameters, when full combinations are too many.
2. Add what the technique does not give: edge cases, negative cases (rejected input, missing permission, empty or
   absent data) and regression cases (behaviour next to the change that must not break).
3. For each case decide:
   - **Project**: a key of `commands.test`. A behaviour is tested once, at the lowest layer that shows it; the UI
     keeps only what only the UI shows.
   - **Data role**: a key of `roles`, or `none`. Pick it by purpose: `roleFor.admin` for administration,
     `roleFor.customer` for an ordinary signed-in customer, `roleFor.otherCustomer` for a customer of another
     organization. When the facts have no `roleFor.otherCustomer`, a cross-organization access case is a scope question
     for the person (the planner's Ask), never a role you pick. A test that changes a user's own state creates its own
     user.
   - **A role with or without permission P**: take it from `rolePermissions`, a role whose list holds P or one whose
     list lacks it. When `rolePermissions` is absent, lists no fitting role, or does not settle the question, it is a
     scope question for the person (the planner's Ask). Never infer which role holds a permission from knowledge of
     the platform. `rolePermissions["R"]` is the complete list for R: everything the account ends up with, from every
     source of roles. A role in `roles` without an entry has an unknown permission set, never an empty one, and is
     never "a role without P". Use it only when the person confirms. A case that changes a role or a permission
     plans a new sign-in before checking its effect.
   - **Oracle**: where the expected value comes from, written `ticket:`, `doc:`, `schema:` or `observed:` followed by
     the criterion, page or field. If the only source is what the stand did, the oracle is `observed:` and the case goes
     under `## Observed only`. An `observed:` oracle holds the value the explorer recorded on the stand, with its
     report: `observed: <value> (.qa/reports/explore-<slug>-observed.md)`. Never a value you expect; until it is
     recorded, `observed: pending <what to observe>`.
4. Priority: a flow listed in `critical` first.

## Step 4: Data and Infrastructure

Name the dataset records to read, the records and builders to add, the documents, page objects and `arrange`
methods to add, the optional modules the cases need, and the cases whose correct behaviour the platform is known to
break. This feeds Stand needs, Building blocks and Platform defects in the contract.

## Output

The matrix, in the contract's columns, with the existing coverage above it:

```markdown
## Existing Coverage
- Covered: <criterion> by <spec file>
- Reusable building blocks: <names>
- Gaps: <what is missing>

## Cases
| Case | Technique | Project | Data role | Oracle |
|---|---|---|---|---|
| C-01 <what it shows> | boundary value analysis | <project> | <role or none> | ticket: <criterion> |
```

Then `plan-implementation` turns it into the contract file.

## Example from this repository

| Signal | Project |
|---|---|
| Result of an xAPI query or mutation, frontend business logic (totals, promotions, checkout) | `graphql` |
| Platform administration: catalogue, users and roles, store settings | `restapi` |
| Rendering, navigation, forms, modals | `e2e-frontend` |
| Page builder and page designer behaviour in the admin UI | `e2e-backend` |
| Global settings, index rebuild, restart, store closed to anonymous users | `isolated` |
| API error handling | `graphql` or `restapi`, never e2e |

- Existing coverage lives under `virtocommerce/tests/`: `restapi/`, `graphql/`, `e2e/frontend/`, `e2e/backend/` and
  `isolated/`.
- Reusable blocks in `virtocommerce/`: `graphql/operations/`, `rest/generated/platform.ts`, `pages/`, `arrange/`,
  `builders/`, `support/`, `dataset/data/`, `modules.ts`.
