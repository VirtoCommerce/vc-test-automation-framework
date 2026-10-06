---
name: plan-implementation
description: "Plan file-by-file implementation for test automation tasks — which files to create or modify, in what order, which patterns and existing code to reuse"
argument-hint: "<task-description>"
---

## Implementation Planning

Given a task or test strategy, produce a step-by-step implementation plan with exact file paths, patterns to follow and dependencies.

## Process

### Step 1: Identify All Artifacts Needed

| Artifact | Location | Pattern reference |
|----------|----------|-------------------|
| GraphQL fragment | `api/graphql/fragments/<entity>.graphql` | `api/graphql/fragments/cart.graphql` |
| GraphQL operation | `api/graphql/operations/<area>/<name>.graphql` | `api/graphql/operations/cart/add-item.graphql` |
| Generated GraphQL types | `api/graphql/generated/` (via `npm run codegen:graphql`) | — never edited |
| REST client method / client | `api/rest/clients/<area>-client.ts` | `api/rest/clients/promotions-client.ts` |
| REST named type | `api/rest/types/<area>.ts` | `api/rest/types/marketing.ts` |
| Page object | `pages/frontend/pages/<page>-page.ts` | `pages/frontend/pages/cart-page.ts` |
| Component | `pages/frontend/components/<component>.ts` | `pages/frontend/components/line-item.ts` |
| Shell page object | `pages/backend/page-builder/*.ts` | `pages/backend/page-builder/pages-list-blade.ts` |
| Builder | `dataset/builders/<area>.ts` | `dataset/builders/marketing.ts` |
| Arrange helper | `dataset/arrange/<area>.ts` | `dataset/arrange/order.ts`, `dataset/arrange/cart.ts` |
| Seeded constant | `dataset/seeded.ts` | existing `SEEDED_*` entries |
| Seeded record | `dataset/data/<entity>/*.json` (+ `manifest.json` for a new entity) | neighbouring JSON files |
| Fixture or option | `fixtures/<name>.fixture.ts`, exported from `fixtures/index.ts` | `fixtures/cart.fixture.ts` (`withItems`) |
| REST spec | `tests/restapi/<area>/<feature>.spec.ts` | `tests/restapi/marketing/promotions.spec.ts` |
| GraphQL spec | `tests/graphql/<area>/<feature>.spec.ts` | `tests/graphql/cart/cart-items.spec.ts` |
| e2e spec | `tests/e2e/frontend/<area>/<feature>.spec.ts` | `tests/e2e/frontend/cart/cart-items.spec.ts` |
| Area support module | `tests/<project>/<area>/<area>-support.ts` | `tests/e2e/frontend/checkout/checkout-support.ts` |

### Step 2: Check What Already Exists

Before adding a file, search for:
- Documents that already query the needed fields (often only a fragment field is missing)
- Client methods, page objects and components that cover the need
- `arrange…()` helpers and builders, including ones that need one more parameter
- Seeded data that already fits

### Step 3: Determine Implementation Order

```
1. api/graphql/fragments, api/graphql/operations   then  npm run codegen:graphql
2. api/rest/types, api/rest/clients                (npm run codegen:rest first after a platform upgrade)
3. pages/... components, then pages that use them
4. dataset/data records (+ manifest), dataset/seeded.ts
5. dataset/builders, then dataset/arrange
6. fixtures (only when a new fixture or option is really needed)
7. specs: restapi, graphql, e2e
```

### Step 4: Reference Existing Patterns

Every new file names the existing file it follows (see the table above), so the implementer copies a working shape instead of inventing one.

## Output Format

```markdown
# Implementation Plan: <Task Name>

## Summary
<1-2 sentences: what will be built and why>

## Prerequisites
- [ ] <platform modules, seeded data, codegen, anything to verify first>

## Files to Create/Modify

### Phase 1: Infrastructure

#### 1. `<file path>` (CREATE/MODIFY)
- **Pattern reference:** `<existing file>`
- **What:** <description>
- **Details:**
  - <operation, method, locator, helper or constant to add>
- **Skill to use:** `/create-graphql-layer` | `/create-rest-client` | `/create-ui-layer` | none

### Phase 2: Test Data

#### N. `<file path>` (CREATE/MODIFY)
- **Pattern reference:** `<existing file>`
- **What:** <builder, arrange helper, seeded constant or record>

### Phase 3: Specs

#### M. `<file path>` (CREATE/MODIFY)
- **Pattern reference:** `<existing spec>`
- **allure.feature:** `"<Area> / <Topic>"`
- **describe blocks:** `"<topic> (<who>)"` with their `test.use(...)` options
- **Tests:**
  - `"<title>"` — <what it verifies>; setup <fixtures/helpers>; cleanup <how>
- **Markers:** <test.fail / @destructive / mode: "default", or none>
- **Skill to use:** `/write-rest-api-test` | `/write-graphql-test` | `/write-e2e-test`

## Verification Steps
1. `npm run typecheck` and `npm run check`
2. `npx playwright test --list`
3. `npx playwright test <specs>` against a seeded platform (re-run `npm run seed` first if dataset records changed)

## Risks and Notes
- <parallel-run interference, eventual consistency, theme settings, known platform issues>
```

## Planning Rules

1. **Never propose a new file when an existing one can be extended.**
2. **Always name the pattern reference file.**
3. **Always name the skill** for each file.
4. **Run codegen right after document changes**; specs import the generated `…Document` constants.
5. **Order by dependency.**
6. **One spec file per feature area**; related tests stay together.
7. **Every created entity has a cleanup** in the plan, and tests that change account state use `customerAccount`.
8. **Respect layer rules**: no API calls in page objects, no page imports in `dataset`, specs import `test`/`expect` from `@fixtures`.
