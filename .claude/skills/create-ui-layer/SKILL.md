---
name: create-ui-layer
description: "Create page objects (MainLayout/CheckoutLayout subclasses), components and page-builder shell objects with readonly Playwright locators and data-test-id conventions"
argument-hint: "<page-or-component>"
---

## UI Layer

Page objects live in `pages/` and may import only from `core` (enforced by `biome/layers.json`): locators and user actions, no API calls, no data setup, no assertions.

## File Locations

- Frontend layouts: `pages/frontend/layouts/` (`MainLayout`, `CheckoutLayout`)
- Frontend pages: `pages/frontend/pages/<area>-page.ts` or a group file (`account-pages.ts`, `checkout-pages.ts`, `simple-pages.ts`)
- Frontend components: `pages/frontend/components/<component>.ts`
- Multi-step flows: `pages/frontend/checkout-flow.ts`
- Platform admin (vc-shell) building blocks: `pages/backend/shell/` (`Blade`, `DataGrid`, `BladeToolbar`, controls)
- Page-builder shell: `pages/backend/page-builder/`
- Shared helpers: `pages/graphql-traffic.ts` (response predicates), `pages/text-match.ts`, `pages/attribute-selector.ts`

## Layout

```ts
export abstract class MainLayout {
  readonly page: Page;
  readonly root: Locator;
  readonly topHeader: TopHeader;
  readonly cartQuantityLabel: Locator;
  abstract readonly path: string;

  constructor(page: Page) {
    this.page = page;
    this.root = page.locator(".main-layout");
    this.topHeader = new TopHeader(page.locator("[data-test-id='top-header']"));
    this.cartQuantityLabel = page.locator("[data-test-id='desktop-main-menu-cart-link'] .vc-badge__content");
  }

  async navigate(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: "load" });
  }
}
```

`path` is relative: the e2e projects set `baseURL`.

## Page

```ts
export class CartPage extends MainLayout {
  readonly path = "/cart";
  readonly lineItems: Locator;
  readonly clearCartButton: Locator;
  readonly clearCartModal: ConfirmationModal;
  readonly checkoutButton: Locator;

  constructor(page: Page) {
    super(page);
    this.lineItems = page.locator("[data-product-sku]");
    this.clearCartButton = page.locator("[data-test-id='clear-cart-button']");
    this.clearCartModal = new ConfirmationModal(page.locator("[data-test-id='clear-cart-modal']"), "yes-button", "no-button");
    this.checkoutButton = page.locator("[data-test-id='checkout-button']");
  }

  lineItem(sku: string): LineItem {
    return new LineItem(this.page.locator(`[data-product-sku='${sku}']`));
  }
}
```

A page with no extra elements is one line: `export class HomePage extends MainLayout { readonly path = "/"; }`. A page with a variable path takes it in the constructor (`ContentPage`).

## Component

```ts
export class LineItem {
  readonly root: Locator;
  readonly quantityStepper: QuantityStepper;
  readonly removeButton: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.quantityStepper = new QuantityStepper(root.locator("[data-test-id='quantity-stepper']"));
    this.removeButton = root.locator("[data-test-id='remove-item-button']");
  }
}
```

- Every component takes its `root: Locator`; child locators are relative to it
- Extra constructor data only when the markup needs it (`ProductCard(root, sku)`, `ConfirmationModal(root, confirmId, cancelId)`)

## Actions

Methods for multi-step interactions the UI requires; they wait for the state they produce, never for time:

```ts
async expandComponents(): Promise<void> {
  await this.componentsListToggle.waitFor();
  if ((await this.collapsedComponentsList.count()) > 0) {
    await this.componentsListToggle.click();
    await this.collapsedComponentsList.waitFor({ state: "detached" });
  }
}
```

Actions that can open a new tab return the `Page` the user ends up on (`ProductCard.openConfigurations()`).

## Locator Conventions

```ts
page.locator("[data-test-id='clear-cart-button']")          // first choice
page.locator(`[data-product-sku='${sku}']`)                   // data attributes for item identity
root.locator(".vc-blade-header__title")                       // vc-shell / theme classes when there is no test id
locator.filter({ hasText: title })                            // narrowing by visible text
```

- `.first()` / `.nth()` only when the markup repeats an element by design, and never to pick an item by its position in a list
- Exact text matching with `exactText(value)` from `pages/text-match.ts` instead of substring `hasText` when names share prefixes

## Rules

1. `readonly` fields for every locator and child component, assigned in the constructor
2. Pages extend `MainLayout` or `CheckoutLayout` and declare `path`; shell objects build on `Blade` and `DataGrid`
3. Components take a root `Locator`; no `Page` field unless the component must navigate or open tabs (`root.page()`)
4. `data-test-id` first; ask for a test id in the frontend when a stable one is missing
5. No assertions, no `expect`, no API calls, no imports outside `core` and `@playwright/test` types
6. No `waitForTimeout`, no `networkidle`; wait for locators or states
7. Named exports only; one class per concept, grouped files only for small related pages
