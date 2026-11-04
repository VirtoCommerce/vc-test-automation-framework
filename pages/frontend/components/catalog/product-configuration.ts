import type { Locator } from "@playwright/test";

import { exactText, startsWithText } from "../../../selectors";
import { RadioButton } from "../../ui-kit/radio-button";
import { Widget } from "../../ui-kit/widget";

/** Option of a product configuration section. */
export class ProductConfigurationOption {
  readonly root: Locator;
  readonly radio: RadioButton;

  constructor(root: Locator) {
    this.root = root;
    this.radio = new RadioButton(root);
  }
}

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

/** Configuration area of a configurable product page. */
export class ProductConfiguration {
  readonly root: Locator;

  constructor(root: Locator) {
    this.root = root;
  }

  /** @param name - Section title start, such as `Memory` (matches `Memory *`). */
  section(name: string): ProductConfigurationSection {
    return new ProductConfigurationSection(
      this.root.getByTestId("section").filter({
        has: this.root
          .page()
          .getByTestId("section-title")
          .filter({ hasText: startsWithText(name) }),
      }),
    );
  }
}
