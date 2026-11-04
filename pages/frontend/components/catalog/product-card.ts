import type { Locator, Page } from "@playwright/test";
import type { QuantityControlKind } from "../../ui-kit/quantity-control";

import { QuantityControl } from "../../ui-kit/quantity-control";

/**
 * Product card on a category page, in grid or list view; get one with `CategoryPage.scrollToProduct`.
 * Its add-to-cart input applies a quantity by clicking the button.
 */
export class ProductCard {
  readonly root: Locator;
  readonly quantity: QuantityControl;
  readonly addToListButton: Locator;
  /** Link to configure a configurable product; prefer {@link openConfigurations}. */
  readonly configurationsButton: Locator;
  /** Expands the variations of a product with variations. */
  readonly variationsButton: Locator;
  readonly #kind: QuantityControlKind;

  constructor(root: Locator, sku: string, kind: QuantityControlKind) {
    this.root = root;
    this.#kind = kind;
    this.quantity = new QuantityControl(root, kind, "click");
    this.addToListButton = root.getByTestId("add-to-list-button");
    this.configurationsButton = root.getByTestId("product-card-configurations-button");
    this.variationsButton = root.getByTestId(`variations-${sku}-button`).first();
  }

  /** Quantity control of a variation; click {@link variationsButton} first to show the variations. */
  variation(sku: string): QuantityControl {
    return new QuantityControl(this.root.locator(`[data-item-sku='${sku}']`), this.#kind, "click");
  }

  /**
   * Clicks the configure link, following it into a new tab when the link targets `_blank`.
   * @returns The page showing the product: the new tab, or the current page. Build page objects on it.
   */
  async openConfigurations(): Promise<Page> {
    const page = this.root.page();
    if ((await this.configurationsButton.getAttribute("target")) !== "_blank") {
      await this.configurationsButton.click();
      return page;
    }
    const [tab] = await Promise.all([page.waitForEvent("popup"), this.configurationsButton.click()]);
    return tab;
  }
}
