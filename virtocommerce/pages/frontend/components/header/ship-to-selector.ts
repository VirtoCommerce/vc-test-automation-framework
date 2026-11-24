import type { Locator } from "@playwright/test";

import { attributeSelector } from "../../../shared/selectors.ts";

/** Ship-to address attributes to match exactly; omitted fields match any address. */
export interface ShipToAddressFilter {
  readonly postalCode?: string;
  readonly countryName?: string;
  readonly regionName?: string;
  readonly city?: string;
  readonly line1?: string;
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
