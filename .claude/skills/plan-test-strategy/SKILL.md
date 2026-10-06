---
name: plan-test-strategy
description: "Analyze a Jira ticket, feature requirement, or bug report and produce a structured test coverage strategy — what to test, which Playwright project, priority, test data needs"
argument-hint: "<ticket-or-requirement>"
---

## Test Strategy Planning

When given a requirement, feature description, or Jira ticket, produce a structured test strategy.

## Process

### Step 1: Understand the Requirement

- Read the ticket or requirement carefully
- Identify the area (cart, checkout, catalog, contacts, orders, quotes, shopping lists, pickup, content, page builder, platform security, …)
- Identify the roles involved (anonymous, seeded user, fresh customer account, organization maintainer, store administrator, platform admin)
- Identify the surface: xAPI queries and mutations, REST endpoints, frontend pages, page-builder shell blades

### Step 2: Explore Existing Coverage

Search before planning anything new:

```
tests/graphql/<area>/*.spec.ts
tests/restapi/<area>/*.spec.ts
tests/e2e/frontend/<area>/*.spec.ts
tests/e2e/backend/page-builder/*.spec.ts
```

And the building blocks to reuse:

```
api/graphql/operations/<area>/*.graphql      existing queries and mutations
api/rest/clients/<area>-client.ts            REST client methods
pages/frontend/{pages,components,layouts}/   page objects
dataset/arrange/*.ts, dataset/builders/*.ts  setup helpers and drafts
dataset/seeded.ts, dataset/data/             seeded users, products and other records
```

### Step 3: Design Test Cases

For each behavior, decide:

1. **What to assert**: the specific expected outcome
2. **Project**: `graphql` (frontend business logic), `restapi` (admin API), `e2e-frontend` (UI only), `e2e-backend` (page-builder shell)
3. **Who**: anonymous, `seededUser(...)` for read-only checks, `customerAccount` for anything that changes account state, platform admin
4. **Setup**: fixtures and options (`withItems`, `withCustomerAccount`, `customerAccountRole`), `arrange…()` helpers, builders
5. **Cleanup**: which helper or `cleanupStack` entry undoes each created entity
6. **Priority**: P0 (critical path), P1 (important), P2 (edge case)
7. **Markers**: known product issue (`test.fail`), `@destructive`, shared global state (`mode: "default"`)

### Step 4: Identify Test Data Needs

- Seeded entries the tests read (by `dataset/seeded.ts` constant, or a new constant to add)
- New records for `dataset/data/` (and whether the seed must be re-run)
- New builders or `arrange…()` helpers

## Output Format

```markdown
# Test Strategy: <Feature Name>

## Requirement Summary
<1-3 sentences describing what the feature does>

## Existing Coverage
- **Existing specs:** <files>
- **Reusable building blocks:** <documents, client methods, page objects, helpers>
- **Gaps:** <what's missing>

## Test Cases

### P0 — Critical Path
| # | Test title | Project | Verifies | Who | Setup | Cleanup | Markers |
|---|------------|---------|----------|-----|-------|---------|---------|
| 1 | <plain-words title> | graphql/restapi/e2e-frontend/e2e-backend | <outcome> | <role> | <fixtures, helpers> | <how> | <none / fail / destructive / serial file> |

### P1 — Important
| # | Test title | Project | Verifies | Who | Setup | Cleanup | Markers |
|---|------------|---------|----------|-----|-------|---------|---------|

### P2 — Edge Cases
| # | Test title | Project | Verifies | Who | Setup | Cleanup | Markers |
|---|------------|---------|----------|-----|-------|---------|---------|

## Test Data Requirements
- **Seeded data used:** <constants>
- **New seeded constants:** <to add to dataset/seeded.ts, or "None">
- **New dataset records:** <files under dataset/data, or "None">

## New Infrastructure Needed
- **GraphQL documents:** <operations/fragments to add, or "None">
- **REST client methods / types:** <or "None">
- **Page objects / components:** <or "None">
- **Builders / arrange helpers:** <or "None">

## Allure Organization
- **Features:** <allure.feature values, e.g. "Cart / Coupons", "Checkout (E2E)">
- **Describe blocks:** <e.g. "coupons (customer account)">

## Parallelism and Risks
<shared data or settings, eventual consistency (search index, pickup), theme-dependent behavior, known platform issues>
```

## Project Decision Guide

| Signal | Project |
|--------|---------|
| Result of an xAPI query or mutation | **graphql** |
| Frontend business logic (cart totals, promotions, checkout, registration) | **graphql** |
| Admin CRUD, platform settings, users and roles, catalog administration | **restapi** |
| Rendering, navigation, forms, modals, what the shopper sees | **e2e-frontend** |
| Page-builder shell behavior | **e2e-backend** |
| Error handling of an API | **graphql** or **restapi**, not e2e |
| Same logic for anonymous and signed-in shoppers | **graphql**, one `describe` per role |

## Coverage Patterns by Area

### Cart
- Anonymous and signed-in cart operations (graphql, `arrangeCart`)
- Account-specific behavior: merge, saved for later (graphql, `customerAccount`)
- Cart page interactions: quantity, remove, clear (e2e-frontend, `withItems`, `withCustomerAccount`)

### Catalog
- Search, filters, facets, SEO, variations, configurable products (graphql)
- Catalog, category and product administration (restapi, builders + `createCategoryWithProduct`)
- Category page filters, sorting, view switcher (e2e-frontend)

### Customers and Security
- Registration, invitations, password reset (graphql)
- Contacts, organizations, members, users, roles, API keys (restapi, `arrangeUser`, `arrangeRole`, `arrangeApiKey`)
- Organization switcher and account pages (e2e-frontend, `withCustomerAccount`)

### Orders, Quotes and Checkout
- Order creation from a cart, order queries (graphql, `customerAccount`)
- Order administration (restapi, `arrangeOrder`)
- Quotes from carts (graphql, `arrangeQuoteFromCart`)
- Checkout UI per `CHECKOUT_MODE` (e2e-frontend, `withItems`, `CheckoutFlow`)

### Page Builder
- Page administration and statuses (restapi via `PageBuilderClient`, e2e-backend through the shell)
- Published pages on the frontend (e2e-frontend)
