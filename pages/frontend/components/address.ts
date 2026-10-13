import type { Locator, Page } from "@playwright/test";

import { attributeSelector, exactText } from "../../selectors";
import { Chip, DropdownFilter } from "./controls";

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

/** Address filter levels, broadest first; omitted levels are not applied. */
export interface AddressFilter {
  readonly country: string;
  readonly region?: string;
  readonly city?: string;
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
    this.firstNameInput = root.locator("[data-test-id='first-name-input']");
    this.lastNameInput = root.locator("[data-test-id='last-name-input']");
    this.emailInput = root.locator("[data-test-id='email-input']");
    this.phoneInput = root.locator("[data-test-id='phone-input']");
    this.countrySelect = root.locator("[data-test-id='country-select']");
    this.postalCodeInput = root.locator("[data-test-id='postal-code-input']");
    this.regionSelect = root.locator("[data-test-id='region-select']");
    this.cityInput = root.locator("[data-test-id='city-input']");
    this.line1Input = root.locator("[data-test-id='line-1-input']");
    this.line2Input = root.locator("[data-test-id='line-2-input']");
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
    this.root = page.locator("[data-test-id='edit-address-modal']");
    this.form = new AddressForm(this.root.locator("[data-test-id='address-form']"));
    this.submitButton = this.root.locator("[data-test-id='submit-button']");
  }

  /** Fills the form and clicks submit; does not wait for the modal to close. */
  async submit(address: FormAddress): Promise<void> {
    await this.form.fill(address);
    await this.submitButton.click();
  }
}

/** Country, region and city filters plus keyword search of an address or pickup location list. */
export class AddressFilters {
  readonly root: Locator;
  readonly country: DropdownFilter;
  readonly region: DropdownFilter;
  readonly city: DropdownFilter;
  readonly appliedChips: Locator;
  readonly keywordInput: Locator;
  readonly searchButton: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.country = new DropdownFilter(root.locator("[data-test-id='filter-country']"));
    this.region = new DropdownFilter(root.locator("[data-test-id='filter-region']"));
    this.city = new DropdownFilter(root.locator("[data-test-id='filter-city']"));
    this.appliedChips = root.locator(".vc-chip");
    this.keywordInput = root.locator("[data-test-id='search-keyword-input']");
    this.searchButton = root.locator("[data-test-id='search-button']");
  }

  /** Applies the given levels from country to city, waiting for each level's chip before the next. */
  async apply(filter: AddressFilter): Promise<void> {
    const levels: readonly [DropdownFilter, string | undefined][] = [
      [this.country, filter.country],
      [this.region, filter.region],
      [this.city, filter.city],
    ];
    for (const [dropdown, value] of levels.filter(
      (level): level is [DropdownFilter, string] => level[1] !== undefined,
    )) {
      await dropdown.apply(value);
      await this.appliedChip(value).root.waitFor();
    }
  }

  /** Chip of an applied filter value, matched by contained text. */
  appliedChip(name: string): Chip {
    return new Chip(this.appliedChips.filter({ hasText: name }));
  }

  /** Types a keyword and clicks search; does not wait for the results. */
  async search(keyword: string): Promise<void> {
    await this.keywordInput.fill(keyword);
    await this.searchButton.click();
  }
}

/** Modal that picks one of the saved addresses. */
export class SelectAddressModal {
  readonly root: Locator;
  readonly okButton: Locator;
  readonly filters: AddressFilters;
  readonly addresses: Locator;

  constructor(page: Page) {
    this.root = page.locator("[data-test-id='select-address-modal']");
    this.okButton = this.root.locator("[data-test-id='confirm-button']");
    this.filters = new AddressFilters(this.root);
    this.addresses = this.root.locator("[data-test-id^='customer-address-']");
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

/** Pickup location card attributes to match exactly; omitted fields match any card. */
export interface PickupLocationCardFilter {
  readonly country?: string;
  readonly region?: string;
  readonly city?: string;
  readonly name?: string;
}

const PICKUP_LOCATION_CARD = ".select-address-map-list__item";

/** Modal that picks a pickup location. */
export class PickupLocationsModal {
  readonly root: Locator;
  readonly filters: AddressFilters;
  readonly cards: Locator;

  constructor(page: Page) {
    this.root = page.locator("[data-test-id='pickup-locations-modal']");
    this.filters = new AddressFilters(this.root);
    this.cards = this.root.locator(PICKUP_LOCATION_CARD);
  }

  /** Location cards whose `data-country`/`data-region`/`data-city`/`data-pickup-point-name` match the filter. */
  cardsWhere(filter: PickupLocationCardFilter): Locator {
    return this.root.locator(
      `${PICKUP_LOCATION_CARD}${attributeSelector({
        "data-country": filter.country,
        "data-region": filter.region,
        "data-city": filter.city,
        "data-pickup-point-name": filter.name,
      })}`,
    );
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
