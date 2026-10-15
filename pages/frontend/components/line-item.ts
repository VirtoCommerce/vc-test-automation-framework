import type { Locator } from "@playwright/test";
import type { QuantityControlKind } from "../ui-kit/quantity-control";

import { QuantityControl } from "../ui-kit/quantity-control";

/** Line item of the cart, a list or saved-for-later; its add-to-cart input applies a quantity on blur. */
export class LineItem {
  readonly root: Locator;
  readonly quantity: QuantityControl;
  readonly removeButton: Locator;
  readonly saveForLaterButton: Locator;
  /** Shown on configured line items only. */
  readonly editConfigurationLink: Locator;
  readonly #componentsToggle: Locator;
  readonly #collapsedComponents: Locator;

  constructor(root: Locator, kind: QuantityControlKind) {
    this.root = root;
    this.quantity = new QuantityControl(root, kind, "blur");
    this.removeButton = root.getByTestId("remove-item-button");
    this.saveForLaterButton = root.getByTestId("cart-item-actions-after-title").getByTestId("save-for-later-button");
    this.editConfigurationLink = root.locator(".configuration-items__edit");
    this.#componentsToggle = root.locator("button.configuration-items__toggle");
    this.#collapsedComponents = root.locator(".configuration-items--collapsed");
  }

  /** Expands the component list if collapsed; configured line items only, since it waits for the toggle. */
  async expandComponents(): Promise<void> {
    await this.#componentsToggle.waitFor();
    if ((await this.#collapsedComponents.count()) > 0) {
      await this.#componentsToggle.click();
      await this.#collapsedComponents.waitFor({ state: "detached" });
    }
  }
}
