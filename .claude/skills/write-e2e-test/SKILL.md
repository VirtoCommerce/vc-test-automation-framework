---
name: write-e2e-test
description: "Write e2e specs for the frontend and the page-builder shell — page objects, web-first assertions, pre-signed-in browsers, prefilled carts, theme-dependent skips, Allure features"
argument-hint: "<area> <test-scenario>"
---

## E2E Spec Writing

- Frontend specs: `tests/e2e/frontend/<area>/<feature>.spec.ts`, project `e2e-frontend` (parallel workers, `baseURL` = `FRONTEND_BASE_URL`)
- Page-builder shell specs: `tests/e2e/backend/page-builder/<feature>.spec.ts`, project `e2e-backend` (one worker, signed in as the platform admin, `baseURL` = `BACKEND_BASE_URL`)

Prefer GraphQL or REST for logic; an e2e test checks what only the browser shows.

## Imports

```ts
import * as allure from "allure-js-commons";

import { SEEDED_PRODUCTS } from "@dataset/seeded";
import { expect, test, withCustomerAccount, withItems } from "@fixtures";
import { CartPage } from "@pages/frontend/pages/cart-page";
import { isGraphqlMutation } from "@pages/graphql-traffic";
```

## File Skeleton

```ts
const PRODUCT_ID = SEEDED_PRODUCTS.galaxyA57;
const ORIGINAL_QUANTITY = 3;

test.beforeEach(async () => {
  await allure.feature("Cart / Line items (E2E)");
});

test.describe("cart line items (customer account)", () => {
  test.use({
    browserCustomerAccount: withCustomerAccount,
    cart: withItems([{ productId: PRODUCT_ID, quantity: ORIGINAL_QUANTITY }]),
  });

  test("…", async ({ page, env }) => { … });
});
```

## Browser State Before the Test

| Need | Option |
|------|--------|
| Anonymous visitor | nothing (random user id per test) |
| Fresh customer account, signed in | `test.use({ browserCustomerAccount: withCustomerAccount })`; the same account is the `customerAccount` fixture |
| Seeded user, read-only screens | `test.use({ user: seededUser(SEEDED_USERS.storeEmployee) })` |
| Prefilled default cart | `test.use({ cart: withItems([...]) })` (not for configurable products) |
| Organization maintainer | `test.use({ customerAccountRole: "org-maintainer" })` |

The `shopper` fixture is whoever is in the browser (`credentials`, `graphqlClient`, `context`); use it to arrange more data for the same person through the API. Sign in through the UI only when sign-in itself is under test.

## Pattern 1: Interact and Assert

```ts
test("change the quantity with the stepper", async ({ page, env }) => {
  test.skip(env.quantityControl !== "stepper", "The frontend renders the add-to-cart button, not the stepper");
  const cartPage = new CartPage(page);
  const { quantityStepper } = cartPage.lineItem(PRODUCT_ID);

  await test.step(`arrange: open the cart with ${PRODUCT_ID} ×${ORIGINAL_QUANTITY}`, async () => {
    await cartPage.navigate();
    await expect(quantityStepper.quantityInput).toHaveValue(String(ORIGINAL_QUANTITY));
  });

  await test.step("act: increment the quantity", () =>
    Promise.all([page.waitForResponse(isGraphqlMutation()), quantityStepper.incrementButton.click()]));

  await test.step("assert: the cart badge shows 4", async () => {
    await expect(cartPage.cartQuantityLabel).toHaveText("4");
  });
});
```

- Wait for the mutation an action triggers (`isGraphqlMutation`, `isGraphqlOperation`) when the next step depends on the server state
- Theme-dependent behavior: `test.skip` on `env.quantityControl`, `env.rangeFilterType`, `env.checkoutMode`; checkout steps go through `CheckoutFlow`, which adapts to `env.checkoutMode`

## Pattern 2: Arrange Through the API, Check in the UI

```ts
test("pick a saved address", async ({ page, customerAccount }) => {
  const address = await test.step("arrange: a saved organization address", () =>
    saveMemberAddress(customerAccount.graphqlClient, customerAccount.organizationId, newMemberAddress("test-ship-to")));
  const homePage = new HomePage(page);
  // act and assert in the UI
});
```

## Pattern 3: Page-Builder Shell

```ts
test.beforeEach(async () => {
  await allure.feature("Page Builder Shell / Page management (E2E)");
});

test.describe("page management (platform admin)", () => {
  test("rename a page", async ({ pageBuilder, pageBuilderClient, cleanupStack, env }) => {
    const page = await arrangeDraftPage(pageBuilderClient, cleanupStack, env.storeId);
    await test.step("act: …", async () => {
      await pageBuilder.open(Route.draft);
      // …
    });
    await test.step("assert: …", async () => {
      const listing = await pageBuilder.waitUntilListed(Route.draft, page.name);
      expect(await listing.pageRow(page.name).value(Column.permalink)).toBe(`/${page.name}`);
    });
  });
});
```

Counters, status lists and search are global in the shell; that is why `e2e-backend` runs on one worker.

## Assertions

```ts
await expect(locator).toBeVisible();
await expect(locator).toHaveText("…");
await expect(locator).toHaveValue("3");
await expect(locator).toHaveCount(2);
await expect(page).toHaveURL(/\/cart$/);
await expect.poll(async () => (await findDefaultCart(shopper.graphqlClient, shopper.context))?.itemsCount).toBe(3);
```

## Things to Keep in Mind

- Product links can open a new tab (theme setting `details_browser_target`): follow them through the page object (e.g. `ProductCard.openConfigurations()`), never by clicking and asserting on the original `page`
- Browser storage is fixed when the page opens: a lock or password change must happen before a UI sign-in, not before a pre-signed-in page
- The frontend signs in with an e-mail address; fresh accounts use theirs as user name
- Use the default cart in e2e tests (the frontend only shows it); `storageState` registers its removal for the browser's user in every frontend test

## Rules

1. `test`, `expect`, options from `@fixtures`; page objects from `@pages/...`; never `@playwright/test` in specs
2. `allure.feature("<Area> / <Topic> (E2E)")` in `beforeEach`; `describe` per role; `arrange:` / `act:` / `assert:` steps
3. Navigate with `navigate()` / `open(...)`; no raw `page.goto` in specs
4. Web-first assertions only; no `waitForTimeout`, no `networkidle`, no `expect(await locator.isVisible())`
5. Missing locators or actions go into the page object (`/create-ui-layer`), not into the spec
6. Browser state from options and fixtures, data from `dataset/arrange`; every created entity has a cleanup
7. Seeded ids from `dataset/seeded.ts`; constants at module level in `UPPER_SNAKE_CASE`
8. `test.fail(true, "<reason>")` for known product issues
