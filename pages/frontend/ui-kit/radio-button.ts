import type { Locator } from "@playwright/test";

/** Radio button (`VcRadioButton`); read its state on {@link input}, pick it with {@link select}. */
export class RadioButton {
  readonly root: Locator;
  readonly input: Locator;
  readonly #control: Locator;

  /** @param root - Element holding exactly one radio button. */
  constructor(root: Locator) {
    this.root = root;
    this.input = root.locator("input[type='radio']");
    this.#control = root.locator(".vc-radio-button__container");
  }

  /** Clicks the visible control, since the input itself is hidden. */
  async select(): Promise<void> {
    await this.#control.click();
  }
}
