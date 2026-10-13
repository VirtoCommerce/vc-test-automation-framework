---
name: plan-implementation
description: "Plan file-by-file implementation for test automation tasks — which files to create or modify, in what order, which patterns, arrange methods and existing code to reuse"
argument-hint: "<task-description>"
---

## Implementation Planning

Given a task or test strategy, produce a step-by-step plan with exact file paths, the existing file each one
follows, and the order to build them in. Read CLAUDE.md first; it holds the layers and conventions.

## Process

### Step 1: Identify the Artifacts

| Artifact | Location | Pattern reference |
|---|---|---|
| GraphQL fragment | `api/graphql/fragments/<entity>.graphql` | `api/graphql/fragments/cart.graphql` |
| GraphQL operation | `api/graphql/operations/<area>/<name>.graphql` | `api/graphql/operations/cart/add-item.graphql` |
| Generated GraphQL types | `api/graphql/generated/` (`npm run codegen:graphql`) | never edited |
| REST client / resource / method | `api/rest/clients/<module>-client.ts`, registered in `api/rest/rest-api.ts` | `api/rest/clients/pricing-client.ts` |
| REST named type | `api/rest/types/<module>.ts` | `api/rest/types/pricing.ts` |
| Frontend page | `pages/frontend/pages/<group>-pages.ts` + a `Frontend` factory method | `pages/frontend/pages/cart-pages.ts` |
| Frontend component | `pages/frontend/components/<component>.ts` | `pages/frontend/components/controls.ts` |
| Page builder object | `pages/backend/page-builder/page-builder.ts`, `pages/backend/shell/controls.ts` | same files |
| Builder | `dataset/builders/<domain>.ts` | `dataset/builders/pricing.ts` |
| Arrange method | `dataset/arrange/<domain>.ts` (types exported from `index.ts`) | `dataset/arrange/pricing.ts` |
| Seed record | `dataset/data/<collection>/*.json` (+ `dataset/manifest.ts` for a new collection) | neighbouring JSON files |
| Known defect | `dataset/known-issues.ts` | existing entries |
| Fixture or option | `fixtures/<name>.fixture.ts`, exported from `fixtures/index.ts` | `fixtures/browser.fixture.ts` |
| REST spec | `tests/restapi/<platform-module>/<topic>.spec.ts` | `tests/restapi/pricing/pricelists.spec.ts` |
| GraphQL spec | `tests/graphql/<area>/<topic>.spec.ts` | `tests/graphql/cart/cart-items.spec.ts` |
| Frontend e2e spec | `tests/e2e/frontend/<area>/<topic>.spec.ts` | `tests/e2e/frontend/cart/cart.spec.ts` |
| Page builder e2e spec | `tests/e2e/backend/page-builder/<topic>.spec.ts` | `tests/e2e/backend/page-builder/page-status.spec.ts` |
| Destructive spec | `tests/isolated/{restapi,graphql}/<area>/<topic>.spec.ts` | `tests/isolated/graphql/catalog/anonymous-access.spec.ts` |
| Unit test of framework code | `tests/unit/<layer>/…/*.test.ts` | `tests/unit/api/rest/clients/bulk-delete-guards.test.ts` |

### Step 2: Check What Already Exists

Before adding a file, search for:
- documents that already select the needed fields (often only a fragment field is missing);
- client methods, page objects and components that cover the need;
- `arrange.<domain>` methods and builders, including ones that need one more option;
- seeded records in `dataset/data` that already fit.

### Step 3: Order by Dependency

```
1. api/graphql documents          then  npm run codegen:graphql
2. api/rest/types, api/rest/clients   (npm run codegen:rest first after a platform upgrade)
3. pages/: components, then pages, then the Frontend factory method
4. dataset/data records (+ manifest), then npm run seed
5. dataset/builders, then dataset/arrange
6. dataset/known-issues.ts entries
7. fixtures (only when no arrange method or option fits)
8. specs: restapi, graphql, e2e; isolated ones last
9. TESTS.md rows when tests of the old suite move, merge or drop
```

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
- **What:** <operation, method, locator or action to add>
- **Skill to use:** `/create-graphql-layer` | `/create-rest-client` | `/create-ui-layer` | none

### Phase 2: Test Data

#### N. `<file path>` (CREATE/MODIFY)
- **Pattern reference:** `<existing file>`
- **What:** <builder, arrange method with its cleanup, seed record, known issue>

### Phase 3: Specs

#### M. `<file path>` (CREATE/MODIFY)
- **Pattern reference:** `<existing spec>`
- **Allure:** epic `"<REST API | GraphQL | E2E>"`, feature `"<Area> / <Topic>"`, stories `<…>`
- **describe blocks:** `"<topic> (<who>)"` with their `test.use(...)` (`user`, `shopperKind`)
- **Tests:**
  - `"<title>"` — <what it verifies>; arrange <arrange methods / dataset ids>; cleanup <arrange / cleanup.push / …Later>
- **Markers:** <knownIssue(KNOWN_ISSUES.x) / isolated project / none>
- **Skill to use:** `/write-rest-api-test` | `/write-graphql-test` | `/write-e2e-test`

## Verification Steps
1. `npm run typecheck` and `npm run check`
2. `npx playwright test --list`
3. The changed specs through their npm script against a seeded platform (`npm run seed` first if data changed)
4. `npm run test:unit` when framework code changed

## Risks and Notes
- <parallel-run interference, index lag, frontend settings, known defects>
```

## Planning Rules

1. Never propose a new file when an existing one can be extended.
2. Always name the pattern reference file and the skill for each file.
3. Run codegen right after document changes; specs import the generated `…Document` constants.
4. One spec file per topic; tests placed by platform module (users and accounts are `security`).
5. Every change a test makes has its cleanup in the plan, registered before the change. Shared setup is an
   `arrange` method, never a helper function in a spec.
6. A test that changes a customer's own state creates its own customer (`arrange.customers.customerAccount()`,
   or `shopperKind: "customer"` in e2e).
7. Platform-wide changes (global settings, index, restart, store access) go to `tests/isolated/`.
8. Respect the layers: no API calls in page objects, no page imports in `dataset`, specs import `test`, `expect`
   and `knownIssue` from `@fixtures`.
