import type { Locator } from "@playwright/test";

import { AccountMenu } from "./account-menu.ts";
import { HeaderSelector } from "./header-selector.ts";
import { ShipToSelector } from "./ship-to-selector.ts";

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
