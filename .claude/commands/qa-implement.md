# QA Implement

**Stage 2 of 3** in the QA workflow: Plan → Implement → Review

You are orchestrating the implementation stage. Spawn the `qa-automation-expert` agent to execute the implementation plan from the previous `/qa-plan` stage.

## Input

The implementation plan should already exist in the conversation from a previous `/qa-plan` run. If no plan exists, ask the user to run `/qa-plan` first or provide a task description.

If `$ARGUMENTS` is provided, use it as additional context or override instructions.

## Steps

### 1. Review the Plan

Read the implementation plan from the conversation. Identify:
- Files to create or modify, in dependency order
- The skill to invoke for each file
- The pattern reference for each file

### 2. Execute Phase by Phase

Spawn the `qa-automation-expert` agent and execute the plan in order:

**Phase 1: Infrastructure**
- `.graphql` operations or fragments → `/create-graphql-layer` (includes `npm run codegen:graphql`)
- REST client methods, clients or named types → `/create-rest-client`
- Page objects and components → `/create-ui-layer`
- Builders (`dataset/builders/`), `arrange` methods (`dataset/arrange/<domain>.ts`), dataset records (`dataset/data/`) and `KNOWN_ISSUES` entries → follow the pattern references in the plan and README.md

**Phase 2: Tests**
- REST specs → `/write-rest-api-test`
- GraphQL specs → `/write-graphql-test`
- e2e specs (frontend or page builder) → `/write-e2e-test`
- TESTS.md, when a test of the old suite moved, merged or was dropped

### 3. Verify

Follow CLAUDE.md "Before handing work over":

```shell
npm run typecheck
npm run check
npx playwright test --list                         # every spec and fixture loads
npm run test:<project> -- <new or changed specs>   # against a seeded platform
npm run test:unit                                  # when core, api, dataset, pages or fixtures changed
```

New dataset records need `npm run seed` (and a reindex) before the specs that read them can pass. Tests in `tests/isolated/` run only with `RUN_DESTRUCTIVE_TESTS=true npm run test:isolated`.

Fix every type error, lint finding and failing test before reporting. If the platform is not reachable, say so and report the run as not done.

### 4. Output

Present a summary:
- Files created or modified
- Tests added (titles)
- Verification results, with any failures and their cause

End with:
```
Implementation complete. Run /qa-review to review the code.
```
