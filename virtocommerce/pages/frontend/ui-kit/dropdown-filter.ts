import type { Locator } from "@playwright/test";

/** Popover filter with a list of values, such as the country filter of an address list. */
export class DropdownFilter {
  readonly root: Locator;
  readonly button: Locator;
  readonly list: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.button = root.locator(".vc-popover__trigger");
    this.list = root.locator(".vc-popover__content");
  }

  /**
   * Opens the list, picks a value and waits until the list is closed.
   * @param name - Value as its `title` attribute shows it, such as `Canada`.
   */
  async apply(name: string): Promise<void> {
    await this.button.click();
    await this.list.locator(`[title=${JSON.stringify(name)}]`).click();
    if (await this.list.isVisible()) {
      await this.button.click();
    }
    await this.list.waitFor({ state: "hidden" });
  }
}
