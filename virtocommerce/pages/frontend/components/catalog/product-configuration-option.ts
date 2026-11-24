import type { Locator } from "@playwright/test";

import { RadioButton } from "../../ui-kit/radio-button.ts";

/** Option of a product configuration section. */
export class ProductConfigurationOption {
  readonly root: Locator;
  readonly radio: RadioButton;

  constructor(root: Locator) {
    this.root = root;
    this.radio = new RadioButton(root);
  }
}
