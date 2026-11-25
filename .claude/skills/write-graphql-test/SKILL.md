---
name: write-graphql-test
description: "Write xAPI GraphQL specs following project patterns — typed documents through shopper.graphql.execute with shopper.storeContext, the shopperAs option and customers from arrange, carts and lists from arrange, arrange/act/assert steps"
argument-hint: "<area> <test-scenario>"
---

## GraphQL Spec Writing

Specs live in `<suiteDir>/tests/graphql/<area>/<topic>.spec.ts` and run in the GraphQL project (a key of
`commands.test` in the project facts). A test that changes platform-wide state goes to the isolated directory.

Read first: skill `framework-rules`, then `project-facts` (`node .claude/checks/project-facts.mts`). Copy the shape
of a neighbouring spec of the same area.

## Step 1: Find the Building Blocks

- Document: `virtocommerce/graphql/operations/<area>/*.graphql`; import the generated `…Document` from
  `@graphql/generated/graphql.ts`. Missing one? Add it with `/create-graphql-layer`.
- Test data: `arrange.carts`, `arrange.customers`, `arrange.orders`, `arrange.pickup`, … (`virtocommerce/arrange/`).
- Seeded records: `dataset.products.get(id)` and the like; stock helpers in `@dataset/stock.ts`.
- Line items: `lineItemOf(cart, productId)` from `@graphql/line-items.ts`.

## Step 2: Choose Who Calls

| Need | Use |
|---|---|
| Anonymous shopper | `shopper` (the default `shopperAs: "anonymous"`; a random user id per test, so carts never collide) |
| Read-only checks as a dataset user | `test.use({ shopperAs: ORGANIZATION_EMPLOYEE })` (credentials from `@dataset/users.ts`), then `shopper` |
| Anything that changes a customer's own state (cart, lists, addresses, locks, orders) | `test.use({ shopperAs: "customer" })`, then `shopper`; `customerOf(shopper)` (`@arrange`) gives its contact, organization and membership ids |
| A second customer in the same test | `const other = await arrange.customers.customer()` |
| A customer with an organization role | `arrange.customers.customer({ role: "<role id the contract names>" })` |
| A colleague in the same organization | `arrange.customers.customer({ organizationId: customer.organizationId })` |
| A platform user (administration over xAPI) | `test.use({ user: ADMIN_ACCOUNT })` (`roles[roleFor.admin]`; the facts may name none: ask who administers), then the `graphql` fixture |

A `Customer` from `arrange` is a `Shopper` too: `customer.graphql`, `customer.storeContext`.

## Step 3: Write the Spec

```ts
import { expect, test } from "@fixtures";
import { AddItemDocument, RemoveCartItemDocument } from "@graphql/generated/graphql.ts";
import { lineItemOf } from "@graphql/line-items.ts";
import { requireFields } from "@support/require-fields.ts";
import { uniqueId } from "@support/unique-id.ts";

const PRODUCT_ID = "product-smartphone-apple-iphone-17-256gb-black";

test.describe("cart items (anonymous)", () => {
  test("add a single product to a new cart", async ({ shopper, arrange }) => {
    const context = shopper.storeContext;

    const { addItem } = await test.step("act: add the product ×1", () =>
      shopper.graphql.execute(AddItemDocument, {
        command: { ...context, cartName: uniqueId("test-cart"), productId: PRODUCT_ID, quantity: 1 },
      }));
    const cart = requireFields(addItem, ["id"], "Cart with the product");
    arrange.carts.removeCartLater(shopper, cart.id);

    await test.step("assert: a cart of the shopper holds the product ×1", () => {
      expect(cart).toMatchObject({ customerId: context.userId, itemsQuantity: 1 });
      expect(lineItemOf(cart, PRODUCT_ID).quantity).toBe(1);
    });
  });

  test("remove a line item", async ({ shopper, arrange }) => {
    const cart = await test.step("arrange: cart with a product", () =>
      arrange.carts.cart(shopper, [{ productId: PRODUCT_ID, quantity: 1 }]));

    const { removeCartItem } = await test.step("act: remove the line item", async () =>
      shopper.graphql.execute(RemoveCartItemDocument, {
        command: { ...shopper.storeContext, cartId: cart.id, lineItemId: lineItemOf(cart, PRODUCT_ID).id },
      }));

    await test.step("assert: the cart is empty", () => {
      expect(removeCartItem).toMatchObject({ itemsCount: 0, items: [] });
    });
  });
});
```

- `shopper.storeContext` gives `storeId`, `userId`, `currencyCode` and `cultureName` of the store under test; spread
  it into the variables, never hard-code them.
- `arrange.carts.cart(shopper, items)` fills the shopper's default cart and removes it after the test;
  `checkoutReadyCart` also adds a shipment and a payment. A cart the act itself creates gets a unique name
  (`cartName: uniqueId("test-cart")`).
- The platform assigns GraphQL cart and list ids, so register removal right after the act, before any assertion
  (`arrange.carts.removeCartLater`, `arrange.orders.deleteQuoteLater`, `arrange.orders.deleteOrdersOfLater`).

## Step 4: Pick the Pattern

**Expected errors.** `execute` throws a `GraphqlError` whose message lists each error as `[CODE] message`:

```ts
await expect(
  shopper.graphql.execute(GetPromotionCouponsDocument, { ...shopper.storeContext, first: ALL_COUPONS }),
).rejects.toThrow(`[${UNAUTHORIZED}]`);
```

Use `executeRaw` to read partial data or several errors; it returns `data` and `errors` without throwing:

```ts
const result = await shopper.graphql.executeRaw(GetUserDocument, { userName: otherUserName });
expect(result.data?.user).toBeNull();
expect(result.errors).toEqual([expect.objectContaining({ extensions: expect.objectContaining({ code: "Forbidden" }) })]);
```

**Cart totals.** To check that a cart's total is its subtotal minus discounts plus tax and shipping (after a coupon,
a promotion or a shipment), use `expect(cart).toHaveConsistentTotals()` rather than writing the sum out.

**Index-backed reads** (search, pickup locations, memberships, addresses). Wait in `arrange`
(`arrange.pickup.pickupLocations`, `cartPickupLocations`, `productPickupLocations`,
`arrange.customers.searchableMemberships`, `lockMemberships`) or poll with `INDEX_LAG_TIMEOUT_MS` from
`@support/poll.ts`.

**Repeated cases.** One table, one loop; rows may hold small lambdas (see
`virtocommerce/tests/graphql/cart/cart-items.spec.ts`, `KINDS`).

**Seeded values.** Read them, do not copy them: `String(dataset.products.get(PRODUCT_ID).code)`.

**Optional modules.** `test.use({ modules: { xMarketing: MODULES.xMarketing } })` (`@modules`) on the describe.

**Platform defects.** The test asserts the correct behaviour. A new defect stays failing; a confirmed one that
fails every time is a known issue (`framework-rules`, Platform Defects): `PLATFORM_DEFECT_TAG`, the ticket as an
`issue` annotation, and `test.fail(true, "<ticket>: <defect>")`.

## Rules

1. `test`, `expect` from `@fixtures`; typed `…Document` constants only, no inline query strings.
2. Every phase is a `test.step("arrange: …" | "act: …" | "assert: …")`.
3. No conditionals or `as` casts in the spec; constants at module level in `UPPER_SNAKE_CASE`.
4. A test that changes a customer's state uses a customer created for the test; dataset users only for read-only
   checks.
5. Every created cart, list, quote, order, address or location is removed after the test, registered before any
   assertion.
6. Nullable results unwrapped with `requireFields` / `requireDefined` / `lineItemOf`; never `?? ""` or `?? []`.
7. No sleeps; `expect.poll` with `INDEX_LAG_TIMEOUT_MS` or an `arrange` wait.
8. Under a contract, a test's title starts with its case id (`C-01 …`), and each row of a table-driven test carries its
   own case id in its title: `contract.mts check --implemented` finds a case's tests by it.
9. Style (comments, naming, wording) comes from the repository's `CLAUDE.md`.

## Verify

Run `commands.typecheck`, `commands.lint` (when the facts have one) and `commands.test["graphql"]` (the GraphQL project's key) from the project
facts on the changed spec, with the run record the expert agent describes.

## Example from this repository

The framework's own suite, as an example and not a rule; another repository's values come from its facts and files.

- Reference specs: `virtocommerce/tests/graphql/cart/cart-items.spec.ts`,
  `virtocommerce/tests/graphql/cart/shopping-lists.spec.ts` (`shopperAs: "customer"`),
  `virtocommerce/tests/graphql/security/users.spec.ts` (`executeRaw`).
- Areas: cart, catalog, customer, marketing, orders, pickup, quotes, security. Isolated specs:
  `virtocommerce/tests/isolated/graphql/`.
- A seeded product id: `product-smartphone-apple-iphone-17-256gb-black` (`virtocommerce/dataset/data/products/`).
- An organization maintainer: `arrange.customers.customer({ role: "role-org-maintainer" })`, a seeded role id, not a
  key of `roles`.
- Commands: `npm run typecheck && npm run check`, then:

  ```shell
  npx --no playwright test --config=virtocommerce --no-deps virtocommerce/tests/graphql/<area>/<topic>.spec.ts --project=graphql
  ```
