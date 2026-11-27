import type { Locator, Page } from "@playwright/test";
import type { FormAddress } from "./address-form.ts";

import { AddressForm } from "./address-form.ts";

/** Modal that adds or edits an address. */
export class EditAddressModal {
  readonly root: Locator;
  readonly form: AddressForm;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.root = page.getByTestId("edit-address-modal");
    this.form = new AddressForm(this.root.getByTestId("address-form"));
    this.submitButton = this.root.getByTestId("submit-button");
  }

  /** Fills the form and clicks submit; does not wait for the modal to close. */
  async submit(address: FormAddress): Promise<void> {
    await this.form.fill(address);
    await this.submitButton.click();
  }
}
