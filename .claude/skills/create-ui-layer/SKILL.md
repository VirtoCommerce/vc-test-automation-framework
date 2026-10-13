---
name: create-ui-layer
description: "Create frontend page objects (FrontendPage subclasses, components, the Frontend factory) and page builder shell objects (Blade, DataGrid controls) with readonly Playwright locators, data-test-id selectors and actions that hide frontend settings from specs"
argument-hint: "<page-or-component>"
---

## UI Layer

Page objects live in `pages/` and import only `core` and Playwright types (`biome/layers.json`): locators and
user actions, no API calls, no test data. Specs hold no selectors, so every locator a test needs lives here.

## File Locations

- Frontend factory: `pages/frontend/frontend.ts` (`Frontend`, the `frontend` fixture)
- Frontend pages: `pages/frontend/pages/` — `layout.ts` (`FrontendPage`), `cart-pages.ts` (`CartPage`,
  `SavedForLaterPage`, `CheckoutFlow`), `catalog-pages.ts`, `account-pages.ts`, `site-pages.ts`
- Frontend components: `pages/frontend/components/` — `controls.ts` (`QuantityControl`, `ConfirmationModal`,
  `Chip`, `DropdownFilter`), `product.ts`, `address.ts`, `checkout.ts`, `header.ts`, `wishlist.ts`
- Admin UI building blocks: `pages/backend/shell/controls.ts` (`Blade`, `DataGrid`, `GridRow`, `Select`,
  `DatePicker`, `Card`, `AppMenu`, `Notifications`, `ConfirmationPopup`)
- Page builder: `pages/backend/page-builder/page-builder.ts` (`PageBuilderShell`, the `pageBuilder` fixture;
  `PagesListBlade`, `PageDetailsBlade`, `Route`, `Column`)
- Shared helpers: `pages/selectors.ts` (`isGraphqlOperation`, `exactText`, `startsWithText`, `attributeSelector`)

## Step 1: Check What Exists

Search the files above first. Often a component exists and needs one more locator, or a page needs a
method.

## Step 2: Page

```ts
export class CartPage extends FrontendPage {
  readonly path = "/cart";
  readonly products: Locator;
  readonly lineItems: Locator;
  readonly clearCartButton: Locator;
  readonly clearCartModal: ConfirmationModal;
  readonly #quantityControl: QuantityControlKind;

  constructor(page: Page, quantityControl: QuantityControlKind) {
    super(page);
    this.#quantityControl = quantityControl;
    this.products = page.locator("[data-test-id='cart.products-section']");
    this.lineItems = productItems(this.products);
    this.clearCartButton = page.locator("[data-test-id='clear-cart-button']");
    this.clearCartModal = new ConfirmationModal(
      page.locator("[data-test-id='clear-cart-modal']"),
      "yes-button",
      "no-button",
    );
  }

  /** @param sku - Product SKU. */
  lineItem(sku: string): LineItem {
    return new LineItem(productItem(this.products, sku), this.#quantityControl);
  }
}
```

- Frontend pages extend `FrontendPage` and declare a relative `path` (`baseURL` is set by the project);
  `navigate()` goes there and waits for `load`.
- A page with a variable path takes it in the constructor (`ContentPage`, `CategoryPage`).
- Add a factory method to `Frontend` for every new page, passing the settings it needs
  (`this.settings.quantityControl`, `rangeFilterType`, `checkoutMode`). Shared modals are `Frontend` fields.

## Step 3: Component

```ts
export class ConfirmationModal {
  readonly root: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;

  constructor(root: Locator, confirmButtonId: string, cancelButtonId: string) {
    this.root = root;
    this.confirmButton = root.locator(`[data-test-id='${confirmButtonId}']`);
    this.cancelButton = root.locator(`[data-test-id='${cancelButtonId}']`);
  }
}
```

- Every component takes its `root: Locator`; child locators are relative to it.
- Extra constructor data only when the markup or a setting needs it (`ProductCard(root, sku, kind)`).
- Admin UI blades extend `Blade` and use its helpers (`toolbarButton`, `card`, `textInput`, `select`,
  `datePicker`, `grid`).

## Step 4: Hide Frontend Settings

The frontend runs with `QUANTITY_CONTROL`, `RANGE_FILTER_TYPE` and `CHECKOUT_MODE`. The page object takes the
setting in its constructor, keeps it in a `readonly #private` field and branches inside, so specs never do. See
`QuantityControl#setQuantity` and `CheckoutFlow#start`:

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
  await Promise.all([
    this.root
      .page()
      .waitForResponse(
        (response) =>
          ["POST", "PUT"].includes(response.request().method()) &&
          new URL(response.url()).pathname.startsWith(SAVE_PATH),
      ),
    this.saveButton.click(),
  ]);
}
```

- An action that can open a new tab returns the `Page` the user ends up on (`ProductCard#openConfigurations`).
- `expect` from `@playwright/test` may be used inside an action to wait for a state (`expect.poll`, `toPass`);
  page objects never assert test outcomes.

## Locator Conventions

```ts
page.locator("[data-test-id='clear-cart-button']")      // first choice
root.locator(`[data-item-sku='${sku}']`)                  // data attributes for item identity
root.locator(".vc-blade-header__title")                   // vc-shell / theme classes when there is no test id
locator.filter({ hasText: exactText(name) })              // narrowing by text; exactText when names share prefixes
```

- `.first()` / `.nth()` only when the markup repeats an element by design, never to pick a list item by position.

## Rules

1. Public locators and child components are `readonly` fields assigned in the constructor; other state is
   `readonly #private`.
2. `data-test-id` first; ask for a test id in the frontend when a stable one is missing.
3. No test assertions, API calls or test data; imports only from `core`, Playwright and `pages/`.
4. No `waitForTimeout`, no `networkidle`; wait for locators, states or responses.
5. Settings-dependent behavior is hidden in the page object; specs never branch or skip on settings.
6. Named exports; function declarations for exported helpers; short JSDoc for waits and side effects; no
   comments.

## Verify

```shell
npm run typecheck && npm run check
npm run test:e2e:frontend -- <a spec that uses the page object>
```

Run the spec with each relevant setting value (e.g. `QUANTITY_CONTROL=button`) when the page object branches on it.
