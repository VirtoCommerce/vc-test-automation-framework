import type { Locator, Page } from "@playwright/test";

import { exactText } from "../../../selectors";

/** Address for {@link AddressForm.fill}; `undefined` or `null` fields are left untouched. */
export interface FormAddress {
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly countryName?: string | null;
  readonly postalCode?: string | null;
  readonly regionName?: string | null;
  readonly city?: string | null;
  readonly line1?: string | null;
  readonly line2?: string | null;
}

/** Address form for adding or editing an address. */
export class AddressForm {
  readonly root: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly countrySelect: Locator;
  readonly postalCodeInput: Locator;
  readonly regionSelect: Locator;
  readonly cityInput: Locator;
  readonly line1Input: Locator;
  readonly line2Input: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.firstNameInput = root.getByTestId("first-name-input");
    this.lastNameInput = root.getByTestId("last-name-input");
    this.emailInput = root.getByTestId("email-input");
    this.phoneInput = root.getByTestId("phone-input");
    this.countrySelect = root.getByTestId("country-select");
    this.postalCodeInput = root.getByTestId("postal-code-input");
    this.regionSelect = root.getByTestId("region-select");
    this.cityInput = root.getByTestId("city-input");
    this.line1Input = root.getByTestId("line-1-input");
    this.line2Input = root.getByTestId("line-2-input");
  }

  /** Fills the given fields, picking the country before the region, since the region list depends on it. */
  async fill(address: FormAddress): Promise<void> {
    const fields: readonly [Locator, string | null | undefined][] = [
      [this.firstNameInput, address.firstName],
      [this.lastNameInput, address.lastName],
      [this.phoneInput, address.phone],
    ];
    for (const [input, value] of fields) {
      await fillGiven(input, value);
    }
    await chooseGiven(this.countrySelect, address.countryName);
    await fillGiven(this.postalCodeInput, address.postalCode);
    await chooseGiven(this.regionSelect, address.regionName);
    for (const [input, value] of [
      [this.cityInput, address.city],
      [this.line1Input, address.line1],
      [this.line2Input, address.line2],
      [this.emailInput, address.email],
    ] as const) {
      await fillGiven(input, value);
    }
  }
}

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

async function fillGiven(input: Locator, value: string | null | undefined): Promise<void> {
  if (value !== undefined && value !== null) {
    await input.fill(value);
  }
}

async function chooseGiven(select: Locator, value: string | null | undefined): Promise<void> {
  if (value !== undefined && value !== null) {
    await select.click();
    await select
      .locator("button")
      .filter({ hasText: exactText(value) })
      .click();
  }
}
