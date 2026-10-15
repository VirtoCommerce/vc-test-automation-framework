import type { Locator } from "@playwright/test";

import { attributeSelector } from "../../selectors";

/** Ship-to address attributes to match exactly; omitted fields match any address. */
export interface ShipToAddressFilter {
  readonly postalCode?: string;
  readonly countryName?: string;
  readonly regionName?: string;
  readonly city?: string;
  readonly line1?: string;
}

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

/** Ship-to address selector of the top header. */
export class ShipToSelector {
  readonly root: Locator;
  readonly selectedAddressLabel: Locator;
  readonly addressesList: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.selectedAddressLabel = root.getByTestId("selected-address-label");
    this.addressesList = root.getByTestId("shipping-addresses-list");
  }

  /** Address buttons in the opened list whose data attributes match the filter. */
  address(filter: ShipToAddressFilter): Locator {
    return this.addressesList.locator(
      `button${attributeSelector({
        "data-postal-code": filter.postalCode,
        "data-country": filter.countryName,
        "data-region": filter.regionName,
        "data-city": filter.city,
        "data-line-1": filter.line1,
      })}`,
    );
  }
}

/** Account menu opened from the account button; lists the user's organizations. */
export class AccountMenu {
  readonly root: Locator;
  readonly dashboardLink: Locator;
  readonly organizationsEmptyList: Locator;
  readonly organizationOptions: Locator;
  readonly #searchInput: Locator;
  readonly #searchButton: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.dashboardLink = root.getByTestId("dashboard-link");
    this.organizationsEmptyList = root.getByTestId("organizations-empty-list");
    this.organizationOptions = root.locator("[data-vc-organization-option] [role='option']");
    this.#searchInput = root.getByTestId("organizations-search").locator("input");
    this.#searchButton = root.getByTestId("organizations-search-button");
  }

  /** Organization entry matched by its exact `data-organization-name`. */
  organization(name: string): Locator {
    return this.root.locator(attributeSelector({ "data-organization-name": name }));
  }

  /** Clickable option that switches to the organization; disabled for a locked membership. */
  organizationOption(name: string): Locator {
    return this.root.locator(`[role='option']:has(${attributeSelector({ "data-organization-name": name })})`);
  }

  /** Types a term into the organization search and clicks search; does not wait for the results. */
  async searchOrganizations(term: string): Promise<void> {
    await this.#searchInput.fill(term);
    await this.#searchButton.click();
  }
}

/** Top header: language, currency, ship-to address and account menu. */
export class TopHeader {
  readonly root: Locator;
  readonly languageSelector: HeaderSelector;
  readonly currencySelector: HeaderSelector;
  readonly accountButton: Locator;
  readonly organizationNameLabel: Locator;
  readonly accountMenu: AccountMenu;
  readonly addShippingAddressButton: Locator;
  readonly shipToSelector: ShipToSelector;

  constructor(root: Locator) {
    this.root = root;
    this.languageSelector = new HeaderSelector(root.getByTestId("language-selector"), "language", "data-culture-name");
    this.currencySelector = new HeaderSelector(root.getByTestId("currency-selector"), "currency", "data-currency-code");
    this.accountButton = root.getByTestId("account-button");
    this.organizationNameLabel = this.accountButton.getByTestId("organization-name-label");
    this.accountMenu = new AccountMenu(root.getByTestId("account-menu"));
    this.addShippingAddressButton = root.getByTestId("add-shipping-address-button");
    this.shipToSelector = new ShipToSelector(root.getByTestId("ship-to-selector"));
  }

  /** Clicks the account button and waits for the account menu. */
  async openAccountMenu(): Promise<void> {
    await this.accountButton.click();
    await this.accountMenu.root.waitFor();
  }
}
