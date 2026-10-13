---
name: plan-test-strategy
description: "Analyze a Jira ticket, feature requirement, or bug report and produce a structured test coverage strategy — what to test, which Playwright project, who runs it, arrange and dataset needs, priority"
argument-hint: "<ticket-or-requirement>"
---

## Test Strategy Planning

Given a requirement, feature or ticket, produce a structured test strategy. Read CLAUDE.md "Writing tests" first.

## Process

### Step 1: Understand the Requirement

- The platform module or area (cart, checkout, catalog, customers, security, orders, quotes, lists, pickup,
  content, page builder, platform settings, …).
- The identities involved: anonymous, dataset user, a customer of the test's own, organization maintainer, store
  administrator, platform admin.
- The surface: xAPI queries and mutations, REST endpoints, frontend pages, page builder blades.

### Step 2: Explore Existing Coverage

Search before planning anything new:

```
tests/restapi/<platform-module>/*.spec.ts
tests/graphql/<area>/*.spec.ts
tests/e2e/frontend/<area>/*.spec.ts
tests/e2e/backend/page-builder/*.spec.ts
tests/isolated/**/*.spec.ts
TESTS.md                                      what the old suite covered and where it went
```

And the building blocks:

```
api/graphql/operations/<area>/*.graphql       queries and mutations
api/rest/clients/<module>-client.ts           REST client methods (api.rest.<module>)
pages/frontend/, pages/backend/               page objects
dataset/arrange/*.ts, dataset/builders/*.ts   arrange methods and drafts
dataset/data/                                 seeded users, products, orders, pages, …
dataset/known-issues.ts                       defects already known
```

### Step 3: Design Test Cases

For each behavior decide:

1. **Assert**: the specific expected outcome.
2. **Project**: `graphql` (frontend business logic), `restapi` (admin API), `e2e-frontend` (what the shopper
   sees), `e2e-backend` (page builder), `isolated` (platform-wide changes).
3. **Who**: anonymous `api`; `test.use({ user: "<dataset user>" })` for read-only checks;
   `arrange.customers.customerAccount()` or `shopperKind: "customer"` for anything that changes a customer's
   state; the store administrator for admin REST.
4. **Arrange**: dataset ids it reads; `arrange.<domain>` methods it needs, existing or new.
5. **Cleanup**: `arrange` handles what it creates; `…Later` methods or `cleanup.push` for what the code under
   test creates.
6. **Priority**: P0 (critical path), P1 (important), P2 (edge case).
7. **Markers**: a known defect (`knownIssue(KNOWN_ISSUES.x)`, with or without a tracker key).

A behavior is tested once at the lowest layer that shows it. The UI keeps only what only the UI shows.

### Step 4: Identify Test Data Needs

- Seeded records the tests read, by dataset id.
- New records for `dataset/data/` (then `npm run seed` and a reindex).
- New builders or `arrange` methods.

## Output Format

```markdown
# Test Strategy: <Feature Name>

## Requirement Summary
<1-3 sentences>

## Existing Coverage
- **Existing specs:** <files>
- **Reusable building blocks:** <documents, client methods, page objects, arrange methods>
- **Gaps:** <what is missing>

## Test Cases

### P0 — Critical Path
| # | Test title | Project | Verifies | Who | Arrange | Cleanup | Markers |
|---|---|---|---|---|---|---|---|
| 1 | <plain-words title> | graphql / restapi / e2e-frontend / e2e-backend / isolated | <outcome> | <identity> | <dataset ids, arrange methods> | <how> | <none / knownIssue> |

### P1 — Important
| # | Test title | Project | Verifies | Who | Arrange | Cleanup | Markers |
|---|---|---|---|---|---|---|---|

### P2 — Edge Cases
| # | Test title | Project | Verifies | Who | Arrange | Cleanup | Markers |
|---|---|---|---|---|---|---|---|

## Test Data Requirements
- **Dataset records used:** <ids>
- **New dataset records:** <files under dataset/data, or "None">

## New Infrastructure Needed
- **GraphQL documents:** <or "None">
- **REST client methods / types:** <or "None">
- **Page objects / components:** <or "None">
- **Builders / arrange methods:** <or "None">
- **Known issues:** <entries for dataset/known-issues.ts, or "None">

## Allure Organization
- **Epic / feature:** <e.g. "GraphQL" / "Cart / Coupons", "E2E" / "Frontend / Checkout">
- **Describe blocks:** <e.g. "coupons (customer of their own)">

## Parallelism and Risks
<shared data or settings, index lag, frontend settings (QUANTITY_CONTROL, RANGE_FILTER_TYPE, CHECKOUT_MODE),
known defects>
```

## Project Decision Guide

| Signal | Project |
|---|---|
| Result of an xAPI query or mutation | `graphql` |
| Frontend business logic (cart totals, promotions, checkout, registration) | `graphql` |
| Admin CRUD, users and roles, catalog administration, store settings | `restapi` |
| Rendering, navigation, forms, modals, what the shopper sees | `e2e-frontend` |
| Page builder app behavior | `e2e-backend` |
| Global settings, index rebuild, restart, store closed to anonymous users | `isolated` |
| Error handling of an API | `graphql` or `restapi`, not e2e |
| Same logic for anonymous and signed-in shoppers | `graphql`, one `describe` per identity |

## Coverage Patterns by Area

- **Cart:** cart operations (graphql, `arrange.carts.cart`); merge and saved for later (graphql, a customer of
  the test's own); cart page quantity, remove, clear (e2e-frontend, `arrange.carts.defaultCart(shopper.api, …)`).
- **Catalog:** search, filters, facets, variations, configurable products (graphql); catalog administration
  (restapi, `arrange.catalog`); category page filters and sorting (e2e-frontend).
- **Customers:** contacts, organizations, members, addresses (restapi `customer`, graphql `customer`,
  `arrange.customers`).
- **Security:** platform users, roles, API keys, OAuth apps, sign-in, password reset (restapi `security`,
  graphql `security`, `arrange.security`). Users and accounts are `security`, not `customer`.
- **Orders, quotes, checkout:** order from cart and order queries (graphql); order administration (restapi,
  `arrange.orders.order`); quotes (graphql, `arrange.orders.quoteFromCart`); checkout UI in either
  `CHECKOUT_MODE` (e2e-frontend, `frontend.checkout()`).
- **Pickup:** availability rules (graphql, `arrange.pickup`); one filter test in the checkout UI.
- **Page builder:** page administration and validation (restapi `page-builder`); statuses and blades
  (e2e-backend, `arrange.content.page()`); published pages on the frontend (e2e-frontend).
