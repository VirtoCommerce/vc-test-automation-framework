import type { Locator } from "@playwright/test";

import { exactText } from "../../../shared/selectors.ts";
import { Widget } from "../../ui-kit/widget.ts";
import { ProductConfigurationOption } from "./product-configuration-option.ts";

/** Product configuration section, such as Memory. */
export class ProductConfigurationSection {
  readonly root: Locator;
  /** Section subtitle showing the selected option. */
  readonly selectedOptionLabel: Locator;
  readonly requiredMark: Locator;
  readonly #widget: Widget;
  readonly #options: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.selectedOptionLabel = root.getByTestId("section-subtitle");
    this.requiredMark = root.locator(".product-configuration__required");
    this.#widget = new Widget(root);
    this.#options = root.getByTestId("product-option");
  }

  /** @param name - Option's product name, matched exactly. */
  option(name: string): ProductConfigurationOption {
    return new ProductConfigurationOption(
      this.#options.filter({ has: this.root.page().locator("a", { hasText: exactText(name) }) }),
    );
  }

  /**
   * Expands the section if collapsed and selects the option; does not wait for the price to update.
   * @param name - Option's product name, matched exactly.
   */
  async select(name: string): Promise<ProductConfigurationOption> {
    await this.#widget.expand();
    const option = this.option(name);
    await option.radio.select();
    return option;
  }
}
