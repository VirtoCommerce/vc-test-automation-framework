import type { Locator } from "@playwright/test";

/** Checkout delivery section: shipping/pickup switch, address or pickup location, and shipping method. */
export class ShippingDetailsSection {
  readonly root: Locator;
  readonly pickupSwitcher: Locator;
  readonly shippingSwitcher: Locator;
  readonly shippingAddressSection: Locator;
  readonly shippingAddressButton: Locator;
  readonly shippingAddressLabel: Locator;
  readonly pickupLocationSection: Locator;
  readonly pickupLocationButton: Locator;
  readonly shippingMethodSelector: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.pickupSwitcher = root.getByTestId("pickup-switcher");
    this.shippingSwitcher = root.getByTestId("shipping-switcher");
    this.shippingAddressSection = root.getByTestId("shipping-address-section");
    this.shippingAddressButton = this.shippingAddressSection.getByTestId("select-address-button");
    this.shippingAddressLabel = this.shippingAddressSection.getByTestId("selected-address-label");
    this.pickupLocationSection = root.getByTestId("pickup-location-section");
    this.pickupLocationButton = this.pickupLocationSection.getByTestId("select-address-button");
    this.shippingMethodSelector = root.getByTestId("shipping-method-selector");
  }

  /**
   * The method selector, matched only while it shows this method as selected; assert it is visible.
   * @param code - Method and option, such as `FixedRate_Ground`.
   */
  selectedShippingMethod(code: string): Locator {
    return this.root.locator(`[data-selected-shipping-method-id='${code}']`);
  }

  /**
   * Opens the method dropdown and picks a method; does not wait for the cart to update.
   * @param code - Method and option, such as `FixedRate_Ground`.
   */
  async selectShippingMethod(code: string): Promise<void> {
    await this.shippingMethodSelector.click();
    await this.root.locator(`[data-shipping-method-id='${code}']`).click();
  }
}
