---
name: write-e2e-test
description: "Write e2e specs for the frontend and for an admin UI app — page objects from the frontend, pageBuilder and pageDesigner fixtures, the shopper fixture and shopperAs option, data arranged through the API, web-first assertions"
argument-hint: "<area> <test-scenario>"
---

## E2E Spec Writing

Specs live where the suite's Playwright configuration (`<suiteDir>/playwright.config.ts`) puts the browser projects
(keys of `commands.test` in the project facts that run a browser): one directory per project, one subdirectory per
area. A project that shares state between tests runs with one worker; read its configuration instead of assuming.

A UI test checks the UI. Data rules (search semantics, prices, validation) are checked once through the API.

Read first: skill `framework-rules`, then `project-facts` (`node .claude/checks/project-facts.mts`), then
`virtocommerce/pages/README.md`. Copy the shape of a neighbouring spec of the same project.

## Step 1: Browser State Before the Test

The browser starts signed in: on the frontend as `shopper`, in the admin UI as `user` (or `ADMINISTRATOR` when `user`
is not set). Data the browser shows is arranged through the API as the same identity.

| Need | Use |
|---|---|
| Anonymous visitor | nothing (the default `shopperAs: "anonymous"`) |
| A fresh signed-in customer | `test.use({ shopperAs: "customer" })`; `customerOf(shopper)` (`@arrange`) gives its organization and contact ids |
| A dataset customer, read-only | `test.use({ shopperAs: ROLE_ACCOUNT })`, the credentials of `roles["<role>"]` from the suite's dataset users |
| A cart | `arrange.carts.cart(shopper, items)` or `checkoutReadyCart(shopper, items)`: the default cart, the one the frontend shows |
| Lists, addresses | `arrange.carts.shoppingList(shopper, items)`, `arrange.customers.memberAddress(shopper, memberId, draft)` |
| Admin UI content | the `arrange` domain that owns it, such as `arrange.content.page()` |

Sign in through the UI only when sign-in itself is under test. The shopper's default cart is removed after every
frontend test.

## Step 2: Write the Spec

```ts
import { expect, test } from "@fixtures";
import { GetCartDocument } from "@graphql/generated/graphql.ts";

const SKU = "smartphone-samsung-galaxy-a57-5g";
const QUANTITY = 3;
const NEW_QUANTITY = 4;

test.describe("cart (customer of their own)", () => {
  test.use({ shopperAs: "customer" });

  test("change the quantity of a line item", async ({ frontend, shopper, arrange }) => {
    await test.step(`arrange: the cart holds ${SKU} ×${QUANTITY}`, () =>
      arrange.carts.cart(shopper, [{ productId: `product-${SKU}`, quantity: QUANTITY }]));
    const cart = frontend.cart();
    const { quantity } = cart.lineItem(SKU);

    await test.step("arrange: open the cart", async () => {
      await cart.navigate();
      await expect(quantity.input).toHaveValue(String(QUANTITY));
    });

    await test.step(`act: set the quantity to ${NEW_QUANTITY}`, () => quantity.setQuantity(NEW_QUANTITY));

    await test.step(`assert: the badge and the stored cart hold ${NEW_QUANTITY}`, async () => {
      await expect(cart.cartQuantityLabel).toHaveText(String(NEW_QUANTITY));
      await expect
        .poll(async () => {
          const { cart: stored } = await shopper.graphql.execute(GetCartDocument, shopper.storeContext);
          return stored?.items.map((item) => item.quantity);
        })
        .toEqual([NEW_QUANTITY]);
    });
  });
});
```

- `test.describe("<topic> (<who>)")`: `(<a role from roles>)`, `(anonymous)`, `(customer of their own)`, or for an
  admin UI test `(platform admin)`, the identity the admin UI signs in as.
- `frontend` builds page objects for the configured frontend (`frontend.cart()`, `frontend.checkout()`, …; modals
  such as `frontend.pickupLocationsModal` are fields). The page objects hide the frontend's own settings (quantity
  control, checkout mode, range filter type): specs never read those settings and never skip on them. Find the action
  in the page object; when it is missing, add it with `/create-ui-layer`.
- To wait for what a click sends, use `whenGraphql` (or `whenResponse` for REST) from `@pages/shared/responses.ts`:

```ts
await whenGraphql(page, "ClearCart", () => cart.clearCartModal.confirmButton.click());
```

- Shared setup for every test of a describe: a `test.beforeEach` with `arrange:` steps. Setup one test needs stays in
  its body; setup several tests repeat may be a `function` declaration at the end of the spec that takes the fixtures
  it needs (`openPickupLocations` in `checkout-delivery.spec.ts`).

## Step 3: Admin UI Tests

A browser test of an admin app uses that app's fixture and page objects (`pageBuilder`, `pageDesigner`), the identity
the admin UI signs in as, and `arrange` for the data the page shows. A precondition with no UI step goes through
`arrange` (add a method when it has none). What the admin UI creates in the test is removed after it, registered
before the act (`arrange.content.deletePagesLater(name)`). Gate the app's module on the describe:

```ts
import { expect, test } from "@fixtures";
import { MODULES } from "@modules";
import { Column, Route } from "@pages/backend/page-builder/routes.ts";

test.describe("status transitions (platform admin)", () => {
  test.use({ modules: { pageBuilder: MODULES.pageBuilder } });

  test("publishing a draft moves it to the active list", async ({ pageBuilder, arrange }) => {
    const draft = await test.step("arrange: a draft page", () => arrange.content.page());

    await test.step(`act: publish ${draft.name}`, async () => {
      await (await pageBuilder.openPage(draft.name, Route.draft)).publish();
    });

    await test.step("assert: the page moved from the draft list to the active list", async () => {
      expect(await pageBuilder.isListed(Route.draft, draft.name)).toBe(false);
      expect(await pageBuilder.isListed(Route.active, draft.name)).toBe(true);
      await expect(pageBuilder.listBlade.pageRow(draft.name).cell(Column.status)).toHaveText("Published");
    });
  });
});
```

## Assertions

```ts
await expect(locator).toBeVisible();
await expect(locator).toHaveText("…");
await expect(locator).toHaveValue("3");
await expect(locator).toHaveCount(2);
await expect.poll(() => cart.totalAmount()).toBeLessThan(before);
```

## Things to Keep in Mind

- Product links can open a new tab: follow them through the page object (an action that returns the page to build
  on, such as `ProductCard.openConfigurations()`), never by clicking and asserting on the original `page`.
- Browser storage is fixed when the page opens: a lock or password change must happen before a UI sign-in.
- The frontend signs in with an e-mail address (`SignInPage.signIn(email, password)`).

## Rules

1. `test`, `expect` from `@fixtures`; page objects from the fixtures, their types and constants from `@pages/...`.
2. Every phase is a `test.step("arrange: …" | "act: …" | "assert: …")`.
3. No conditionals, `as` casts or raw selectors in the spec. A missing locator or action goes into
   `virtocommerce/pages/` (`/create-ui-layer`).
4. Open pages with `navigate()` / `open(...)` / `start()`; no `page.goto` unless the URL itself is under test.
5. Web-first assertions; no `waitForTimeout`, no `networkidle`, no `expect(await locator.isVisible())`.
6. Data from `dataset`, changes through `arrange`, as the identity the browser is.
7. Platform defects: the test stays failing, with an `issue` annotation when a ticket exists; never `test.fail`.
8. Style (comments, naming, wording) comes from the repository's `CLAUDE.md`.

## Verify

Run `commands.typecheck`, `commands.lint` and `commands.test["<browser project>"]` from the project facts on the
changed spec, with the run record the expert agent describes. Add `--headed --workers=1` to watch a run.

## Example from this repository

- Projects: `frontend` (`virtocommerce/tests/e2e/frontend/<area>/<topic>.spec.ts`; areas account, cart, catalog,
  checkout, lists, site; `E2E_WORKERS` workers) and `backend` (`virtocommerce/tests/e2e/backend/page-builder/`; one
  worker, the page list is shared, the admin UI signed in as `ADMINISTRATOR`).
- Reference specs: `virtocommerce/tests/e2e/frontend/cart/cart.spec.ts`,
  `virtocommerce/tests/e2e/frontend/checkout/checkout-delivery.spec.ts` (`beforeEach`, module gating, a pickup
  location waited for in `arrange`), `virtocommerce/tests/e2e/backend/page-builder/page-status.spec.ts`,
  `virtocommerce/tests/e2e/backend/page-builder/designer-sections.spec.ts` (`pageDesigner.open(pageId, language)`).
- A seeded product: `product-smartphone-samsung-galaxy-a57-5g`, SKU `smartphone-samsung-galaxy-a57-5g`.
- Frontend settings the page objects hide: `QUANTITY_CONTROL`, `RANGE_FILTER_TYPE`, `CHECKOUT_MODE`; `setQuantity`
  works for either quantity control and `frontend.checkout()` walks the single-page or multi-step checkout.
- Page builder pages: `arrange.content.page()`, `publishedPage()`, `archivedPage()`; pages the admin UI creates in the
  test: `arrange.content.deletePagesLater(name)` before the act.
- Commands: `npm run typecheck && npm run check`, then (`VERIFY_SSL=false` in front for a self-signed local
  frontend):

  ```shell
  npx --no playwright test --config=virtocommerce virtocommerce/tests/e2e/frontend/<area>/<topic>.spec.ts --project=frontend
  npx --no playwright test --config=virtocommerce virtocommerce/tests/e2e/backend/page-builder/<topic>.spec.ts --project=backend
  ```
