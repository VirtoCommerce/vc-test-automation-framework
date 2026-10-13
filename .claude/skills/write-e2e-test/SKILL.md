---
name: write-e2e-test
description: "Write e2e specs for the frontend and the page builder app — frontend and pageBuilder page objects, shopper fixture and shopperKind option, data arranged through the API, web-first assertions, Allure epic/feature/story"
argument-hint: "<area> <test-scenario>"
---

## E2E Spec Writing

- Frontend: `tests/e2e/frontend/<area>/<topic>.spec.ts` (areas: account, cart, catalog, checkout, lists, site),
  project `e2e-frontend`, `FRONTEND_WORKERS` workers.
- Page builder: `tests/e2e/backend/page-builder/<topic>.spec.ts`, project `e2e-backend`, one worker (the page
  list is shared), browser signed in to the admin UI as the platform admin.

A UI test checks the UI. Data rules (search semantics, prices, validation) are checked once through the API.

Read first: CLAUDE.md "Writing tests", README "An e2e test". Copy the shape of
`tests/e2e/frontend/cart/cart.spec.ts` or `tests/e2e/backend/page-builder/page-status.spec.ts`.

## Step 1: Browser State Before the Test

| Need | Use |
|---|---|
| Anonymous visitor | nothing (default `shopperKind`) |
| A fresh signed-in customer | `test.use({ shopperKind: "customer" })`; `shopper.account` holds its ids and credentials |
| Data the browser shows (cart, lists, addresses) | arrange it through `shopper.api`, the same identity as the browser |
| A cart | `arrange.carts.defaultCart(shopper.api, items)` (the frontend shows the default cart) |
| Page builder pages | `arrange.content.page()`, `arrange.content.publishedPage()` |

Sign in through the UI only when sign-in itself is under test. The shopper's default cart is removed after every
frontend test.

## Step 2: Write the Spec

```ts
import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

const PRODUCT = { id: "product-smartphone-samsung-galaxy-a57-5g", sku: "smartphone-samsung-galaxy-a57-5g" } as const;
const QUANTITY = 3;
const NEW_QUANTITY = 4;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Cart");
});

test.describe("cart (customer of their own)", () => {
  test.use({ shopperKind: "customer" });

  test("change the quantity of a line item", async ({ frontend, shopper, arrange }) => {
    await allure.story("Line items");
    await allure.description(`A line item's quantity goes from ${QUANTITY} to ${NEW_QUANTITY} in the cart badge.`);
    await test.step(`arrange: the cart holds ${PRODUCT.sku} ×${QUANTITY}`, () =>
      arrange.carts.defaultCart(shopper.api, [{ productId: PRODUCT.id, quantity: QUANTITY }]));
    const cart = frontend.cart();
    const { quantity } = cart.lineItem(PRODUCT.sku);

    await test.step("arrange: open the cart", async () => {
      await cart.navigate();
      await expect(quantity.input).toHaveValue(String(QUANTITY));
    });

    await test.step(`act: set the quantity to ${NEW_QUANTITY}`, () => quantity.setQuantity(NEW_QUANTITY));

    await test.step(`assert: the cart badge shows ${NEW_QUANTITY}`, async () => {
      await expect(cart.cartQuantityLabel).toHaveText(String(NEW_QUANTITY));
    });
  });
});
```

- `allure.epic("E2E")` and `allure.feature("Frontend / <Area>")` or `allure.feature("Admin / Page builder")` in
  `beforeEach`; `allure.story` and `allure.description` first in each test.
- `test.describe("<topic> (<who>)")`: `(anonymous)`, `(customer of their own)`, `(platform admin)`.
- `frontend` builds page objects for the configured frontend. `setQuantity` works for either `QUANTITY_CONTROL`;
  `frontend.checkout()` walks the single-page or multi-step checkout. Specs never read `env.quantityControl`,
  `env.rangeFilterType` or `env.checkoutMode`, and never skip on them.
- To wait for what a click sends, use a predicate from `@pages/selectors`:

```ts
await Promise.all([page.waitForResponse(isGraphqlOperation("ClearCart")), cart.clearCartModal.confirmButton.click()]);
```

- Shared setup for a group of tests: a `beforeEach` with `arrange:` steps, or `test.extend` with a fixture that
  arranges and yields the data (see `tests/e2e/frontend/checkout/checkout-delivery.spec.ts`).

## Step 3: Page Builder Tests

```ts
import { Column, Route } from "@pages/backend/page-builder/page-builder";

test.describe("status transitions (platform admin)", () => {
  test("publishing a draft moves it to the active list", async ({ pageBuilder, arrange }) => {
    await allure.story("Status transitions");
    await allure.description("A published draft leaves the draft list for the active list.");
    const draft = await test.step("arrange: a draft page", () => arrange.content.page());

    await test.step(`act: publish ${draft.name}`, async () => {
      await (await pageBuilder.openPage(draft.name, Route.draft)).publish();
    });

    await test.step("assert: the page moved to the active list", async () => {
      expect(await pageBuilder.isListed(Route.draft, draft.name)).toBe(false);
      expect(await pageBuilder.isListed(Route.active, draft.name)).toBe(true);
      await expect(pageBuilder.listBlade.pageRow(draft.name).cell(Column.status)).toHaveText("Published");
    });
  });
});
```

Pages the admin UI creates in the test: `arrange.content.deletePagesLater(name)` before the act. State that has no UI
step (e.g. archiving for a precondition) goes through `arrange.admin.rest.pageBuilder`.

## Assertions

```ts
await expect(locator).toBeVisible();
await expect(locator).toHaveText("…");
await expect(locator).toHaveValue("3");
await expect(locator).toHaveCount(2);
await expect
  .poll(async () => {
    const { cart } = await shopper.api.graphql.execute(GetCartDocument, await shopper.api.storeContext());
    return cart?.items?.map((item) => item?.quantity);
  })
  .toEqual([4]);
```

## Things to Keep in Mind

- Product links can open a new tab: follow them through the page object (`ProductCard.openConfigurations()`
  returns the page to build on), never by clicking and asserting on the original `page`.
- Browser storage is fixed when the page opens: a lock or password change must happen before a UI sign-in.
- The frontend signs in with an e-mail address.

## Rules

1. `test`, `expect`, `knownIssue` from `@fixtures`; page objects from `@pages/...`.
2. Every phase is a `test.step("arrange: …" | "act: …" | "assert: …")`.
3. No conditionals, `as` casts, helper functions or raw selectors in the spec. A missing locator or action goes
   into `pages/` (`/create-ui-layer`).
4. Open pages with `navigate()` / `open(...)` / `start()`; no `page.goto` unless the URL itself is under test.
5. Web-first assertions; no `waitForTimeout`, no `networkidle`, no `expect(await locator.isVisible())`.
6. Data from `dataset`, changes through `arrange`; cleanup registered before the change.
7. Known defects: `await knownIssue(KNOWN_ISSUES.x)` first in the test.
8. No code comments.

## Verify

```shell
npm run typecheck && npm run check
npm run test:e2e:frontend -- tests/e2e/frontend/<area>/<topic>.spec.ts
npm run test:e2e:backend -- tests/e2e/backend/page-builder/<topic>.spec.ts
```

`VERIFY_SSL=false` for a self-signed local frontend; `--headed --workers=1` to watch.
