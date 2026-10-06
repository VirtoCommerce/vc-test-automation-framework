---
name: write-graphql-test
description: "Write xAPI GraphQL specs following project patterns — typed documents, frontendContext/customerAccount, cart and account helpers, cleanupStack, arrange/act/assert steps, Allure features"
argument-hint: "<area> <test-scenario>"
---

## GraphQL Spec Writing

Specs live in `tests/graphql/<area>/<feature>.spec.ts` and run in the `graphql` project. Follow these patterns exactly.

## Imports

```ts
import * as allure from "allure-js-commons";

import { AddItemDocument, RemoveCartItemDocument } from "@api/graphql/generated/graphql";   // typed documents
import { uniqueId } from "@core/unique-id";
import { arrangeCart, cartScope, lineItemFor, registerCartRemoval, requireCart } from "@dataset/arrange/cart";
import { SEEDED_PRODUCTS } from "@dataset/seeded";
import { expect, test } from "@fixtures";

const PRODUCT_ID = SEEDED_PRODUCTS.iphone17Black;
```

A missing document means a new `.graphql` file under `api/graphql/operations/<area>/` plus `npm run codegen:graphql` (see `/create-graphql-layer`).

## File Skeleton

```ts
test.beforeEach(async () => {
  await allure.feature("Cart / Items");
});

test.describe("cart items (anonymous)", () => {
  test("…", async ({ graphqlClient, cleanupStack, frontendContext }) => { … });
});
```

## Who Calls xAPI

| Need | Use |
|------|-----|
| Anonymous shopper | `graphqlClient` + `frontendContext` (random user id per test) |
| Read-only checks as a seeded user | `test.use({ user: seededUser(SEEDED_USERS.storeMaintainer) })`, then `graphqlClient` + `frontendContext` |
| Anything that changes account state (cart, lists, addresses, orders, organizations) | `customerAccount.graphqlClient` + `customerAccount.context` |
| Maintainer-only operations | `test.use({ customerAccountRole: "org-maintainer" })` |
| A second signed-in client | `signInGraphqlClient(tokenManager, anonymousHttpClient, credentials, env.storeId)` |
| A session the token cache must not reuse (after a lock or password change) | `signInWithoutCache(anonymousHttpClient, credentials, env.storeId)` |

## Pattern 1: Arrange Helper as the Action

```ts
test("add several products in one mutation", async ({ graphqlClient, cleanupStack, frontendContext }) => {
  const items = [
    { productId: PRODUCT_ID, quantity: 3 },
    { productId: VARIATION_ID, quantity: 4 },
  ];

  const cart = await test.step("act: add two products", () =>
    arrangeCart(graphqlClient, cleanupStack, frontendContext, items));

  await test.step("assert: both products are in the cart with their quantities", async () => {
    expect(cart.items).toEqual(expect.arrayContaining(items.map((item) => expect.objectContaining(item))));
  });
});
```

## Pattern 2: Executing a Document

```ts
test("add a single product to a new cart", async ({ graphqlClient, cleanupStack, frontendContext }) => {
  const { addItem } = await test.step("act: add the product ×1", () =>
    graphqlClient.execute(AddItemDocument, {
      command: { ...cartScope(frontendContext), cartName: uniqueId("test-cart"), productId: PRODUCT_ID, quantity: 1 },
    }));
  const cart = requireCart(addItem, "Cart with the product");
  registerCartRemoval(graphqlClient, cleanupStack, frontendContext, cart.id);

  await test.step("assert: the cart holds the product ×1", async () => {
    expect(cart).toMatchObject({ customerId: frontendContext.userId, itemsQuantity: 1 });
    expect(lineItemFor(cart, PRODUCT_ID).quantity).toBe(1);
  });
});
```

- Named carts (`cartName: uniqueId("test-cart")`) keep parallel tests apart; only e2e tests use the default cart
- Unwrap nullable results with `requireCart`, `requireFields`, `lineItemFor` before asserting
- Register cleanup right after the entity exists (`registerCartRemoval`, `registerQuoteRemoval`, `arrangeShoppingList`, …)

## Pattern 3: Expected Errors

```ts
test("another user's account is forbidden", async ({ customerAccount }) => {
  const response = await test.step(`act: get user ${OTHER_USERNAME}`, () =>
    customerAccount.graphqlClient.executeRaw(GetUserDocument, { userName: OTHER_USERNAME }));

  await test.step("assert: access is denied and no user is returned", async () => {
    expect(response.data?.user).toBeNull();
    expect(response.errors).toEqual([
      expect.objectContaining({ extensions: expect.objectContaining({ code: "Forbidden" }) }),
    ]);
  });
});
```

`execute` throws a `GraphqlError` on any error; `executeRaw` returns `{ data, errors, status }` for tests about errors.

## Pattern 4: Eventually Consistent Reads

Index-backed queries (product search, pickup locations, address lists) lag behind writes. Poll for the test's own data:

```ts
const found = await test.step("act: list pickup locations", () =>
  waitForArrangedLocations(arranged, () => productPickupLocations(graphqlClient, frontendContext, PRODUCT_ID)));
```

`waitForArrangedLocations` polls any query you pass; `productPickupLocations` here is the spec's own wrapper around its document.

## Available Helpers

- Cart: `arrangeCart`, `addToDefaultCart`, `findDefaultCart`, `registerCartRemoval`, `registerDefaultCartRemoval`, `lineItemFor`, `requireCart`, `cartScope`
- Catalog: `searchProducts`, `getProductConfiguration`, `optionOfEachSection`
- Accounts: `arrangeCustomerAccount`, `arrangeOrganization`, `addOrganizationMembership`, `signInGraphqlClient`, `signInWithoutCache`
- Quotes, lists, pickup: `arrangeQuoteFromCart`, `arrangeShoppingList`, `addShoppingListItems`, `arrangePickupLocations`, `waitForArrangedLocations`, `availabilityByCity`
- Addresses: `newMemberAddress`, `saveMemberAddress`, `comparableAddress`, `TEST_ADDRESS`
- Stock: `getStockQuantity`, `findFulfillmentCenter` (from `dataset/stock.ts`)

## Rules

1. `test` and `expect` from `@fixtures`; typed documents only, no inline query strings
2. `allure.feature("<Area> / <Topic>")` in `beforeEach`; `describe` per role; `arrange:` / `act:` / `assert:` steps
3. Scope from `cartScope(context)`; ids, currency and culture never hard-coded
4. Account-changing tests use `customerAccount`; seeded users only for read-only checks
5. Every created cart, list, quote, address owner or location has its cleanup
6. Seeded ids from `dataset/seeded.ts`; constants at module level in `UPPER_SNAKE_CASE`
7. `expect.poll` for index-backed reads; never fixed waits
8. `test.fail(true, "<reason>")` for known product issues; `{ tag: "@destructive" }` for tests that change platform-wide security settings
9. No fallbacks hiding missing data; `requireFields` instead
