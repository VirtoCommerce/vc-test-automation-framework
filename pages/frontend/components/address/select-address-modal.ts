import type { Locator, Page } from "@playwright/test";

import { AddressFilters } from "./address-filters";

/** Modal that picks one of the saved addresses. */
export class SelectAddressModal {
  readonly root: Locator;
  readonly okButton: Locator;
  readonly filters: AddressFilters;
  readonly addresses: Locator;

  constructor(page: Page) {
    this.root = page.getByTestId("select-address-modal");
    this.okButton = this.root.getByTestId("confirm-button");
    this.filters = new AddressFilters(this.root);
    this.addresses = this.root.getByTestId(/^customer-address-/);
  }

  /** @param text - Text the address contains, such as its street line. */
  address(text: string): Locator {
    return this.addresses.filter({ hasText: text });
  }

  /**
   * Clicks the address, confirms with OK and waits until the modal is hidden.
   * @param text - Text the address contains, such as its street line.
   */
  async pick(text: string): Promise<void> {
    await this.address(text).click();
    await this.okButton.click();
    await this.root.waitFor({ state: "hidden" });
  }
}
