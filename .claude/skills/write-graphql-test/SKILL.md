---
name: write-graphql-test
description: "Write xAPI GraphQL specs following project patterns — typed documents through api.graphql.execute, api.storeContext(), customers and carts from arrange, cleanup registered before the change, arrange/act/assert steps, Allure epic/feature/story"
argument-hint: "<area> <test-scenario>"
---

## GraphQL Spec Writing

Specs live in `tests/graphql/<area>/<topic>.spec.ts` (areas: cart, catalog, customer, orders, pickup, quotes,
security) and run in the `graphql` project. A test that changes platform-wide state goes to
`tests/isolated/graphql/`.

Read first: CLAUDE.md "Writing tests", README "A GraphQL test". Copy the shape of
`tests/graphql/cart/cart-items.spec.ts`.

## Step 1: Find the Building Blocks

- Document: `api/graphql/operations/<area>/*.graphql`; import the generated `…Document` from
  `@api/graphql/generated/graphql`. Missing one? Add it with `/create-graphql-layer`.
- Test data: `arrange.carts`, `arrange.customers`, `arrange.orders`, `arrange.pickup`, … (`dataset/arrange/`).
- Seeded records: `dataset.products.get(id)` and the like; stock helpers in `@dataset/stock`.
- Line items: `lineItemOf(cart, productId)` from `@api/graphql/line-items`.

## Step 2: Choose Who Calls

| Need | Use |
|---|---|
| Anonymous shopper | `api` (fresh user id per test, so carts never collide) |
| Read-only checks as a dataset user | `test.use({ user: "<dataset user name>" })`, then `api` |
| Anything that changes a customer's own state (cart, lists, addresses, locks, orders) | `const customer = await arrange.customers.customerAccount()`, then `customer.api` |
| An organization maintainer | `arrange.customers.customerAccount({ role: "role-org-maintainer" })` |
| A colleague in the same organization | `arrange.customers.customerAccount({ organizationId: customer.organizationId })` |

## Step 3: Write the Spec

```ts
import * as allure from "allure-js-commons";

import { AddItemDocument, RemoveCartItemDocument } from "@api/graphql/generated/graphql";
import { lineItemOf } from "@api/graphql/line-items";
import { requireFields } from "@core/required-fields";
import { uniqueId } from "@core/unique-id";
import { expect, test } from "@fixtures";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";

test.beforeEach(async () => {
  await allure.epic("GraphQL");
  await allure.feature("Cart / Items");
});

test.describe("cart items (anonymous)", () => {
  test("add a single product to a new cart", async ({ api, arrange }) => {
    await allure.story("Add items");
    await allure.description("Adding one product with AddItem creates a cart of the shopper holding it.");
    const context = await api.storeContext();

    const { addItem } = await test.step("act: add the product ×1", () =>
      api.graphql.execute(AddItemDocument, {
        command: { ...context, cartName: uniqueId("test-cart"), productId: PRODUCT_ID, quantity: 1 },
      }));
    const cart = requireFields(addItem, ["id"], "Cart with the product");
    await arrange.carts.removeCartLater(api, cart.id);

    await test.step("assert: a cart of the shopper holds the product ×1", () => {
      expect(cart).toMatchObject({ customerId: context.userId, itemsQuantity: 1 });
      expect(lineItemOf(cart, PRODUCT_ID).quantity).toBe(1);
    });
  });

  test("remove a line item", async ({ api, arrange }) => {
    await allure.story("Remove items");
    await allure.description("Removing the only line item leaves an empty cart.");
    const cart = await test.step("arrange: cart with a product", () =>
      arrange.carts.cart(api, [{ productId: PRODUCT_ID, quantity: 1 }]));

    const { removeCartItem } = await test.step("act: remove the line item", async () =>
      api.graphql.execute(RemoveCartItemDocument, {
        command: { ...(await api.storeContext()), cartId: cart.id, lineItemId: lineItemOf(cart, PRODUCT_ID).id },
      }));

    await test.step("assert: the cart is empty", () => {
      expect(removeCartItem).toMatchObject({ itemsCount: 0, items: [] });
    });
  });
});
```

- `allure.epic("GraphQL")` and `allure.feature("<Area> / <Topic>")` in `beforeEach`; `allure.story` and
  `allure.description` first in each test.
- `api.storeContext()` gives store, culture, currency and user id; never hard-code them.
- Named carts (`arrange.carts.cart`, `cartName: uniqueId("test-cart")`) keep tests apart. The default cart
  (`arrange.carts.defaultCart`) is for the frontend.
- The platform assigns GraphQL cart and list ids, so register removal right after the create, before any
  assertion (`arrange.carts.removeCartLater`, `arrange.orders.deleteQuoteLater`, `arrange.orders.deleteOrdersOfLater`).

## Step 4: Pick the Pattern

**Expected errors.** `execute` throws `GraphqlError`:

```ts
await expect(api.graphql.execute(CategoriesDocument, variables)).rejects.toBeGraphqlError("Unauthorized");
```

Use `executeRaw` only to read partial data or several errors: `{ operationName, status, data, errors }`.

**Cart totals.** To check that a cart's total is its subtotal minus discounts plus tax and shipping (after a coupon,
a promotion or a shipment), use `expect(cart).toHaveConsistentTotals()` rather than writing the sum out.

**Index-backed reads** (search, pickup locations, memberships, addresses). Wait in `arrange`
(`arrange.pickup.pickupLocations`, `cartPickupLocations`, `productPickupLocations`,
`arrange.customers.searchableMemberships`, `lockMemberships`) or poll with `INDEX_LAG_TIMEOUT_MS` from `@core/poll`.

**Repeated cases.** One table, one loop; rows may hold small lambdas, e.g. a `read: (api: ApiSession) => …` per
query (see `tests/graphql/pickup/pickup-locations.spec.ts`).

**Seeded values.** Read them, do not copy them: `String(dataset.products.get(PRODUCT_ID).code)`,
`stockQuantity(dataset, productId, centerId)`.

**Known defects.** `await knownIssue(KNOWN_ISSUES.x)` first in the test, with the entry in
`dataset/known-issues.ts`.

## Rules

1. `test`, `expect`, `knownIssue` from `@fixtures`; typed `…Document` constants only, no inline query strings.
2. Every phase is a `test.step("arrange: …" | "act: …" | "assert: …")`.
3. No conditionals, `as` casts or helper functions in the spec; constants at module level in `UPPER_SNAKE_CASE`.
4. A test that changes a customer's state creates its own customer; dataset users only for read-only checks.
5. Every created cart, list, quote, order, address or location is removed after the test, registered before any
   assertion.
6. Nullable results unwrapped with `requireFields` / `lineItemOf`; never `?? ""` or `?? []`.
7. No sleeps; `expect.poll` with `INDEX_LAG_TIMEOUT_MS` or an `arrange` wait.
8. No code comments.

## Verify

```shell
npm run typecheck && npm run check
npm run test:graphql -- tests/graphql/<area>/<topic>.spec.ts
```

