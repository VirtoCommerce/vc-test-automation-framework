---
name: create-ui-layer
description: "Create frontend page objects (MainLayout pages, components, ui-kit wrappers, the Frontend factory) and admin UI objects (vc-shell Blade, DataGrid and other controls, page builder and page designer) with readonly Playwright locators, data-test-id selectors and actions that hide frontend settings from specs"
argument-hint: "<page-or-component>"
---

## UI Layer

Page objects hold locators and user actions: no API calls, no test data, no test assertions. Specs hold no selectors,
so every locator a test needs lives here. In this suite they live in `virtocommerce/pages/` and import only
`@playwright/test` and each other, by relative paths; specs and fixtures import them through `@pages/*`.

Read first: skill `framework-rules`, then `project-facts` (`node .claude/checks/project-facts.mts`), then
`virtocommerce/pages/README.md`, which holds the naming and placement rules.

## Where Things Live

| Directory | Holds |
|---|---|
| `frontend/frontend.ts` | `Frontend`, the factory the `frontend` fixture gives to specs |
| `frontend/layouts/` | `MainLayout`, the base of every frontend page |
| `frontend/pages/<area>/` | one page object per frontend page (`account`, `cart`, `catalog`, `checkout`, `lists`, `site`) |
| `frontend/components/<area>/` | parts pages are built from (`address`, `cart`, `catalog`, `checkout`, `coupons`, `header`, `lists`) |
| `frontend/ui-kit/` | elements of the frontend's UI kit, such as `QuantityControl`, `ConfirmationModal` |
| `frontend/flows/` | steps over several pages, such as `CheckoutFlow` |
| `backend/vc-shell/` | the vc-shell UI kit the admin apps share: `Blade`, `DataGrid`, `Card`, `Select`, `DatePicker`, … |
| `backend/page-builder/` | the page builder app: `PageBuilderShell` (the `pageBuilder` fixture), blades, `routes.ts`, `requests.ts` |
| `backend/page-designer/` | the page designer: `PageDesigner` (the `pageDesigner` fixture), its panels and rows |
| `shared/` | `selectors.ts` (`exactText`, `startsWithText`, `attributeSelector`), `responses.ts` (`whenResponse`, `whenGraphql`) |

One class per file, the file named after the class in kebab case (Biome fails anything else); the last word of the
name says what it is (`-page`, `-modal`, `-section`, `-blade`, `-flow`, …); no `index.ts` files.

## Step 1: Check What Exists

Search the directories above first. Often a component exists and needs one more locator, or a page needs a
method.

## Step 2: Page

```ts
import type { Locator, Page } from "@playwright/test";
import type { QuantityControlKind } from "../../ui-kit/quantity-control.ts";

import { LineItem } from "../../components/cart/line-item.ts";
import { productItem, productItems } from "../../components/catalog/product-items.ts";
import { MainLayout } from "../../layouts/main-layout.ts";
import { ConfirmationModal } from "../../ui-kit/confirmation-modal.ts";

/** Cart page; in single-page checkout mode it also holds the shipping and payment sections (`CheckoutFlow`). */
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

- Frontend pages extend `MainLayout` and declare a relative `path` (`baseURL` is set by the project); `navigate()`
  goes there and waits for `load` only.
- A page with a variable path takes it in the constructor (`ContentPage`, `CategoryPage`).
- Add a factory method to `Frontend` for every new page, passing the frontend settings it needs. Modals that open over
  any page are fields of the factory.

## Step 3: Component

```ts
import type { Locator } from "@playwright/test";

/** Frontend modal that asks to confirm an action, such as clearing the cart. */
export class ConfirmationModal {
  readonly root: Locator;
  readonly confirmButton: Locator;

  /** @param confirmButtonId - `data-test-id` of the confirm button, such as `yes-button`. */
  constructor(root: Locator, confirmButtonId: string) {
    this.root = root;
    this.confirmButton = root.getByTestId(confirmButtonId);
  }
}
```

- Every component takes its `root: Locator`; child locators are relative to it.
- Extra constructor data only when the markup or a setting needs it (`LineItem(root, quantityControl)`).
- Admin UI blades extend `Blade` (`backend/vc-shell/blade.ts`) and use its helpers (`toolbarButton`, `card`,
  `field`, `textInput`, `select`, `datePicker`, `firstSwitch`, `grid`).

## Step 4: Hide Frontend Settings

A frontend can run in several modes (a quantity control, a checkout mode, a range filter type). The page object takes
the setting in its constructor, keeps it in a `readonly #private` field and branches inside, so specs never do. The
settings come from `FrontendSettings`, which the `frontend` fixture builds from `QUANTITY_CONTROL`,
`RANGE_FILTER_TYPE` and `CHECKOUT_MODE`. The checkout flow shows the shape:

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

For a GraphQL operation, `whenGraphql(this.root.page(), "AddCoupon", () => this.applyButton.click())`; take the
operation name from what the frontend sends (the request's `operationName`), not from the mutation field. Response
predicates of a backend app live in its `requests.ts`.

- An action that can open a new tab returns the `Page` the user ends up on (`ProductCard.openConfigurations()`).
- `expect` from `@playwright/test` may be used inside an action to wait for a state (`expect.poll`, `toPass`);
  page objects never assert test outcomes.

## Locator Conventions

```ts
page.getByTestId("clear-cart-button");
root.locator(attributeSelector({ "data-item-sku": sku }));
page.locator(".coupons-section");
locator.filter({ hasText: exactText(name) });
```

- `getByTestId` first: the suite's `testIdAttribute` is `data-test-id` (the framework's `defaultUse`). Then roles,
  data attributes for item identity, and component classes only where there is no test id yet.
- `exactText` narrows by text when names share prefixes.
- A UI-kit class (`.vc-*`) goes into a wrapper in `frontend/ui-kit/` or `backend/vc-shell/`, never into a component
  or page.
- `.first()` / `.nth()` only when the markup repeats an element by design, never to pick a list item by position.

## Rules

1. Public locators and child components are `readonly` fields assigned in the constructor; other state is
   `readonly #private`.
2. `data-test-id` first; ask for a test id in the frontend when a stable one is missing.
3. No test assertions, API calls or test data; imports only from `@playwright/test` and other page objects.
4. No `waitForTimeout`, no `networkidle`; wait for locators, states or responses.
5. Settings-dependent behaviour is hidden in the page object; specs never branch or skip on settings.
6. Short JSDoc for waits and side effects; the rest of the style (exports, comments, naming) comes from the
   repository's `CLAUDE.md`.

## Verify

Run `commands.typecheck`, `commands.lint` and `commands.test["<browser project>"]` from the project facts on a spec
that uses the page object. Run the spec with each relevant setting value when the page object branches on it.

## Example from this repository

- Rules for the directory: `virtocommerce/pages/README.md`; Biome's one-class-per-file and kebab-case rules for it are
  in `.biome/layers.json`.
- Frontend factory: `virtocommerce/pages/frontend/frontend.ts` (`Frontend`, `FrontendSettings`).
- Frontend layout: `virtocommerce/pages/frontend/layouts/main-layout.ts` (`MainLayout`, with `cartQuantityLabel` and
  `topHeader`). The multi-step checkout steps use the frontend's secure layout and are driven by `CheckoutFlow`.
- Admin UI kit: `virtocommerce/pages/backend/vc-shell/blade.ts` (`Blade`, `blades`, `DISABLED_TOOLBAR_BUTTON`),
  `data-grid.ts`, `grid-row.ts`, `notifications.ts`, `confirmation-popup.ts`. The only backend files with `.vc-*`
  classes.
- Page builder: `virtocommerce/pages/backend/page-builder/page-builder-shell.ts`, `routes.ts` (`Route`, `Column`,
  `DetailsToolbar`), `requests.ts` (`isPageSave`, `isPagePublishing`).
- Frontend settings: run a spec with `QUANTITY_CONTROL=button` or `CHECKOUT_MODE=multi-step` when the page object
  branches on it.
- Commands: `npm run typecheck && npm run check`, then
  `npx --no playwright test --config=virtocommerce --no-deps <a spec that uses the page object> --project=e2e-frontend`.
