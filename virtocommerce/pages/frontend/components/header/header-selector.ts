import type { Locator } from "@playwright/test";

import { attributeSelector } from "../../../shared/selectors.ts";

/** Currency or language selector of the top header. */
export class HeaderSelector {
  readonly root: Locator;
  readonly button: Locator;
  readonly currentLabel: Locator;
  readonly #itemAttribute: string;

  /** @param itemAttribute - Attribute holding each item's value, such as `data-currency-code`. */
  constructor(root: Locator, name: "currency" | "language", itemAttribute: string) {
    this.root = root;
    this.button = root.getByTestId(`${name}-selector-button`);
    this.currentLabel = root.getByTestId(`current-${name}-label`);
    this.#itemAttribute = itemAttribute;
  }

  /**
   * Opens the selector and picks a value; does not wait for the page to re-render.
   * @param value - Currency code or culture name, such as `EUR` or `de-DE`.
   */
  async select(value: string): Promise<void> {
    await this.button.click();
    await this.root.locator(attributeSelector({ [this.#itemAttribute]: value })).click();
  }
}
