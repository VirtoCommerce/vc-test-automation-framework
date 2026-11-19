---
name: create-ui-layer
description: "Create frontend page objects (MainLayout pages, components, ui-kit wrappers, the Frontend factory) and page builder shell objects (Blade, DataGrid controls) with readonly Playwright locators, data-test-id selectors and actions that hide frontend settings from specs"
argument-hint: "<page-or-component>"
---

## UI Layer

Page objects live in `pages/` and import only what the repository's layer configuration allows (in the default
layering `core` and Playwright types): locators and user actions, no API calls, no test data. Specs hold no
selectors, so every locator a test needs lives here.

Read first: skill `framework-rules`, then `project-facts` (`node .claude/qa/project-facts.mts`).

## Where Things Live

Read the repository's layer configuration and README "Project structure" for the folders. Page objects live in the
folder the `pages` layer owns: a factory for the frontend, a base layout every page extends, UI-kit wrappers (the
only files with the design system's own classes), components, pages, flows over several pages, and one folder per
admin app. Shared helpers wait for the response an action causes. Search them before writing anything.

## Step 1: Check What Exists

Search the folders above first. Often a component exists and needs one more locator, or a page needs a
method.

## Step 2: Page

```ts
export class CartPage extends MainLayout {
  readonly path = "/cart";
  readonly products: Locator;
  readonly lineItems: Locator;
  readonly clearCartButton: Locator;
  readonly clearCartModal: ConfirmationModal;
  readonly #quantityControl: QuantityControlKind;

  constructor(page: Page, quantityControl: QuantityControlKind) {
    super(page);
    this.#quantityControl = quantityControl;
    this.products = page.getByTestId("cart.products-section");
    this.lineItems = productItems(this.products);
    this.clearCartButton = page.getByTestId("clear-cart-button");
    this.clearCartModal = new ConfirmationModal(page.getByTestId("clear-cart-modal"), "yes-button");
  }

  /** @param sku - Product SKU. */
  lineItem(sku: string): LineItem {
    return new LineItem(productItem(this.products, sku), this.#quantityControl);
  }
}
```

- Frontend pages extend `MainLayout` and declare a relative `path` (`baseURL` is set by the project);
  `navigate()` goes there and waits for `load`.
- A page with a variable path takes it in the constructor (`ContentPage`, `CategoryPage`).
- Add a factory method to the frontend factory for every new page, passing the frontend settings it needs. Shared
  modals are fields of the factory.

## Step 3: Component

```ts
export class ConfirmationModal {
  readonly root: Locator;
  readonly confirmButton: Locator;

  constructor(root: Locator, confirmButtonId: string) {
    this.root = root;
    this.confirmButton = root.getByTestId(confirmButtonId);
  }
}
```

- Every component takes its `root: Locator`; child locators are relative to it.
- Extra constructor data only when the markup or a setting needs it (`ProductCard(root, sku, kind)`).
- Admin UI blades extend `Blade` and use its helpers (`toolbarButton`, `card`, `textInput`, `select`,
  `datePicker`, `grid`).

## Step 4: Hide Frontend Settings

A frontend can run in several modes (a control kind, a checkout mode, a filter type). The page object takes the
setting in its constructor, keeps it in a `readonly #private` field and branches inside, so specs never do. Find
the settings in the frontend's configuration object that the factory passes on. A checkout flow shows the shape:

```ts
/** Opens the cart (and in multi-step mode clicks checkout), then waits for the shipping section. */
async start(): Promise<void> {
  await this.cartPage.navigate();
  if (this.mode === "multi-step") {
    await this.cartPage.checkoutButton.click();
  }
  await this.shippingDetails.root.waitFor();
}
```

## Step 5: Actions

Methods for multi-step interactions. They wait for the state or response they produce, never for time, and the
JSDoc says what they wait for:

```ts
/** Clicks save and waits for the save response (POST/PUT), whatever its status; assert the outcome after. */
async save(): Promise<void> {
  await whenResponse(this.root.page(), isPageSave, () => this.saveButton.click());
}
```

For a GraphQL operation, `whenGraphql(page, "AddCoupon", () => button.click())`; take the operation name from
what the frontend sends (the request's `operationName`), not from the mutation field.

- An action that can open a new tab returns the `Page` the user ends up on (`ProductCard#openConfigurations`).
- `expect` from `@playwright/test` may be used inside an action to wait for a state (`expect.poll`, `toPass`);
  page objects never assert test outcomes.

## Locator Conventions

```ts
page.getByTestId("clear-cart-button")                     // first choice; the config sets testIdAttribute to data-test-id
root.locator(`[data-item-sku='${sku}']`)                  // data attributes for item identity
root.locator(".coupon-card")                              // component classes when there is no test id
locator.filter({ hasText: exactText(name) })              // narrowing by text; exactText when names share prefixes
```

- A UI-kit class (`.vc-*`) goes into a wrapper in `frontend/ui-kit/` or `backend/vc-shell/`, never into a
  component or page.
- `.first()` / `.nth()` only when the markup repeats an element by design, never to pick a list item by position.

## Rules

1. Public locators and child components are `readonly` fields assigned in the constructor; other state is
   `readonly #private`.
2. `data-test-id` first; ask for a test id in the frontend when a stable one is missing.
3. No test assertions, API calls or test data; imports only from `core`, Playwright and `pages/`.
4. No `waitForTimeout`, no `networkidle`; wait for locators, states or responses.
5. Settings-dependent behavior is hidden in the page object; specs never branch or skip on settings.
6. Short JSDoc for waits and side effects; the rest of the style (exports, comments, naming) comes from the
   repository's `CLAUDE.md`.

## Verify

Run `commands.typecheck`, `commands.lint` and `commands.test["<browser project>"]` from the project facts on a spec
that uses the page object. Run the spec with each relevant setting value when the page object branches on it.

## Example from this repository

- Layer configuration: `biome/layers.json`; the `pages` layer imports only `core`.
- Frontend factory: `pages/frontend/frontend.ts` (`Frontend`, the `frontend` fixture)
- Frontend layout: `pages/frontend/layouts/main-layout.ts` (`MainLayout`, the base of every page). The multi-step
  checkout steps use the frontend's secure layout and are driven by `CheckoutFlow`; add `secure-layout.ts` when a
  test needs that layout's own parts.
- Frontend UI kit: `pages/frontend/ui-kit/` — one file per vc-frontend UI-kit component (`QuantityControl`,
  `Widget`, `RadioButton`, `DropdownFilter`, `ConfirmationModal`, `chips`, `badgeContent`). The only frontend
  files with `.vc-*` classes.
- Frontend components: `pages/frontend/components/` — a file per area (`header.ts`, `checkout.ts`, `coupons.ts`,
  `wishlist.ts`, `line-item.ts`), a folder once an area grows (`address/`, `catalog/`)
- Frontend pages: `pages/frontend/pages/<area>/<name>-page.ts` (`site`, `catalog`, `cart`, `checkout`, `account`,
  `lists`), one page per file
- Frontend flows: `pages/frontend/flows/` — journeys over several pages (`CheckoutFlow`)
- Admin UI kit: `pages/backend/vc-shell/` — `blade.ts` (`Blade`, `blades`, `DISABLED_TOOLBAR_BUTTON`),
  `data-grid.ts`, `card.ts`, `select.ts`, `date-picker.ts`, `switch.ts`, `feedback.ts` (`ConfirmationPopup`,
  `Notifications`), `app-shell.ts` (`AppMenu`, `UserInfo`). The only backend files with `.vc-*` classes.
- Page builder: `pages/backend/page-builder/` — `page-builder-shell.ts` (`PageBuilderShell`, the `pageBuilder`
  fixture), `pages-list-blade.ts`, `page-details-blade.ts`, `routes.ts` (`Route`, `Column`, `DetailsToolbar`),
  `requests.ts` (response predicates)
- Shared helpers: `pages/selectors.ts` (`exactText`, `startsWithText`, `attributeSelector`) and `pages/responses.ts`
  (`whenGraphql`, `whenResponse`: run an action and wait for the response it causes)
- Frontend settings: `QUANTITY_CONTROL`, `RANGE_FILTER_TYPE`, `CHECKOUT_MODE` (see `QuantityControl#setQuantity` and
  `CheckoutFlow#start`); run a spec with `QUANTITY_CONTROL=button` when the page object branches on it.
- Commands: `npm run typecheck && npm run check`, then
  `npm run test:e2e:frontend -- <a spec that uses the page object>`.
