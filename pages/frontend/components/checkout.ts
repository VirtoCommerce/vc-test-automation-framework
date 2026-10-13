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
    this.pickupSwitcher = root.locator("[data-test-id='pickup-switcher']");
    this.shippingSwitcher = root.locator("[data-test-id='shipping-switcher']");
    this.shippingAddressSection = root.locator("[data-test-id='shipping-address-section']");
    this.shippingAddressButton = this.shippingAddressSection.locator("[data-test-id='select-address-button']");
    this.shippingAddressLabel = this.shippingAddressSection.locator("[data-test-id='selected-address-label']");
    this.pickupLocationSection = root.locator("[data-test-id='pickup-location-section']");
    this.pickupLocationButton = this.pickupLocationSection.locator("[data-test-id='select-address-button']");
    this.shippingMethodSelector = root.locator("[data-test-id='shipping-method-selector']");
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

/** Checkout payment section: billing address and payment method. */
export class PaymentDetailsSection {
  readonly root: Locator;
  readonly billingEqualsShippingCheckbox: Locator;
  readonly selectAddressButton: Locator;
  readonly selectedAddressLabel: Locator;
  readonly paymentMethodSelector: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.billingEqualsShippingCheckbox = root.locator("[data-test-id='billing-address-equals-shipping-checkbox']");
    this.selectAddressButton = root.locator("[data-test-id='select-address-button']");
    this.selectedAddressLabel = root.locator("[data-test-id='selected-address-label']");
    this.paymentMethodSelector = root.locator("[data-test-id='payment-method-selector']");
  }

  /** Unticks "same as shipping" and waits until it is unchecked, so a billing address can be selected. */
  async useSeparateBillingAddress(): Promise<void> {
    await this.billingEqualsShippingCheckbox.locator("label").click();
    await this.billingEqualsShippingCheckbox.locator("input:not(:checked)").waitFor({ state: "attached" });
  }

  /**
   * The method selector, matched only while it shows this method as selected; assert it is visible.
   * @param code - Payment method, such as `DefaultManualPaymentMethod`.
   */
  selectedPaymentMethod(code: string): Locator {
    return this.root.locator(`[data-selected-payment-method-id='${code}']`);
  }

  /**
   * Opens the method dropdown and picks a method; does not wait for the cart to update.
   * @param code - Payment method, such as `DefaultManualPaymentMethod`.
   */
  async selectPaymentMethod(code: string): Promise<void> {
    await this.paymentMethodSelector.click();
    await this.root.locator(`[data-payment-method-id='${code}']`).click();
  }
}
