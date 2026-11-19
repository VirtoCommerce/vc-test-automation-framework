---
name: write-e2e-test
description: "Write e2e specs for the frontend and for an admin UI app — page objects from the frontend and app fixtures, shopper fixture and shopperKind option, data arranged through the API, web-first assertions, Allure epic/feature/story"
argument-hint: "<area> <test-scenario>"
---

## E2E Spec Writing

Specs live where the repository's Playwright configuration puts the browser projects (keys of `commands.test` in
the project facts that run a browser): one folder per project, one subfolder per area. A project that shares state
between tests runs with one worker; read its configuration instead of assuming.

A UI test checks the UI. Data rules (search semantics, prices, validation) are checked once through the API.

Read first: skill `framework-rules`, then `project-facts` (`node .claude/checks/project-facts.mts`), then the repository's
README for its e2e test shape. Copy the shape of a neighbouring spec of the same project.

## Step 1: Browser State Before the Test

| Need | Use |
|---|---|
| Anonymous visitor | nothing (default `shopperKind`) |
| A fresh signed-in customer | `test.use({ shopperKind: "customer" })`; `shopper.account` holds its ids and credentials |
| Data the browser shows (cart, lists, addresses) | arrange it through `shopper.api`, the same identity as the browser |
| A cart | `arrange.carts.defaultCart(shopper.api, items)` (the frontend shows the default cart) |
| Admin UI content | the `arrange` domain that owns it (search `dataset/arrange/`) |

Sign in through the UI only when sign-in itself is under test. The shopper's default cart is removed after every
frontend test.

## Step 2: Write the Spec

```ts
import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

const PRODUCT_ID = "<id of a record in dataset/data/products>";
const QUANTITY = 3;
const NEW_QUANTITY = 4;

test.beforeEach(async () => {
  await allure.epic("E2E");
  await allure.feature("Frontend / Cart");
});

test.describe("cart (customer of their own)", () => {
  test.use({ shopperKind: "customer" });

  test("change the quantity of a line item", async ({ dataset, frontend, shopper, arrange }) => {
    await allure.story("Line items");
    await allure.description(`A line item's quantity goes from ${QUANTITY} to ${NEW_QUANTITY} in the cart badge.`);
    const sku = String(dataset.products.get(PRODUCT_ID).code);
    await test.step(`arrange: the cart holds ${sku} ×${QUANTITY}`, () =>
      arrange.carts.defaultCart(shopper.api, [{ productId: PRODUCT_ID, quantity: QUANTITY }]));
    const cart = frontend.cart();
    const { quantity } = cart.lineItem(sku);

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

- `allure.epic("E2E")` and `allure.feature("<App> / <Area>")` in `beforeEach`; `allure.story` and
  `allure.description` first in each test.
- `test.describe("<topic> (<who>)")`, named by role: `(anonymous)`, `(customer of their own)`, or the role of the
  admin account (`roles["<role>"]` in the project facts).
- `frontend` builds page objects for the configured frontend. The page objects hide the frontend's own settings
  (control kinds, checkout mode, filter type): specs never read those settings and never skip on them. Find the
  action in the page object; when it is missing, add it with `/create-ui-layer`.
- To wait for what a click sends, use `whenGraphql` (or `whenResponse` for REST) from `@pages/responses`:

```ts
await whenGraphql(page, "ClearCart", () => cart.clearCartModal.confirmButton.click());
```

- Shared setup for a group of tests: a `beforeEach` with `arrange:` steps, or `test.extend` with a fixture that
  arranges and yields the data.

## Step 3: Admin UI Tests

A browser test of an admin app (a page builder, a back-office blade) uses that app's fixture and page objects, the
admin account the repository signs the browser in with, and `arrange` for the data the page shows. State that has
no UI step (a precondition) goes through `arrange.admin` or the REST client. What the admin UI creates in the test
is removed after it, registered before the act. Find the app's fixture and its routes under `pages/`.

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

- Product links can open a new tab: follow them through the page object (an action that returns the page to build
  on), never by clicking and asserting on the original `page`.
- Browser storage is fixed when the page opens: a lock or password change must happen before a UI sign-in.
- Check which identifier the frontend signs in with (an e-mail address or a user name) in its page object.

## Rules

1. `test`, `expect`, `knownIssue` from `@fixtures`; page objects from `@pages/...`.
2. Every phase is a `test.step("arrange: …" | "act: …" | "assert: …")`.
3. No conditionals, `as` casts, helper functions or raw selectors in the spec. A missing locator or action goes
   into `pages/` (`/create-ui-layer`).
4. Open pages with `navigate()` / `open(...)` / `start()`; no `page.goto` unless the URL itself is under test.
5. Web-first assertions; no `waitForTimeout`, no `networkidle`, no `expect(await locator.isVisible())`.
6. Data from `dataset`, changes through `arrange`; cleanup registered before the change.
7. Known defects: `await knownIssue(KNOWN_ISSUES.x)` first in the test.
8. Style (comments, naming, wording) comes from the repository's `CLAUDE.md`.

## Verify

Run `commands.typecheck`, `commands.lint` and `commands.test["<browser project>"]` from the project facts on the
changed spec, with the run record the expert agent describes. Add `--headed --workers=1` to watch a run.

## Example from this repository

- Projects: `e2e-frontend` (`tests/e2e/frontend/<area>/<topic>.spec.ts`; areas account, cart, catalog, checkout,
  lists, site; `FRONTEND_WORKERS` workers) and `e2e-backend` (`tests/e2e/backend/page-builder/<topic>.spec.ts`; one
  worker, the page list is shared, browser signed in to the admin UI as the platform admin).
- Reference specs: `tests/e2e/frontend/cart/cart.spec.ts`, `tests/e2e/backend/page-builder/page-status.spec.ts`,
  `tests/e2e/frontend/checkout/checkout-delivery.spec.ts` (shared setup through `test.extend`); README "An e2e test".
- A seeded product: `product-smartphone-samsung-galaxy-a57-5g`, SKU `smartphone-samsung-galaxy-a57-5g`.
- Frontend settings the page objects hide: `QUANTITY_CONTROL`, `RANGE_FILTER_TYPE`, `CHECKOUT_MODE`; `setQuantity`
  works for either quantity control and `frontend.checkout()` walks the single-page or multi-step checkout.
- The frontend signs in with an e-mail address. Product cards: `ProductCard.openConfigurations()` returns the page
  to build on.
- Page builder pages: `arrange.content.page()`, `arrange.content.publishedPage()`; pages the admin UI creates in
  the test: `arrange.content.deletePagesLater(name)` before the act; a precondition with no UI step goes through
  `arrange.admin.rest.pageBuilder`.

```ts
import { Column, Route } from "@pages/backend/page-builder/routes";

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

- Commands: `npm run typecheck && npm run check`, then `npm run test:e2e:frontend -- tests/e2e/frontend/<area>/<topic>.spec.ts`
  or `npm run test:e2e:backend -- tests/e2e/backend/page-builder/<topic>.spec.ts`; `VERIFY_SSL=false` for a
  self-signed local frontend.
