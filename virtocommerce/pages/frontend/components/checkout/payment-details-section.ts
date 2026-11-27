import type { Locator } from "@playwright/test";

/** Checkout payment section: billing address and payment method. */
export class PaymentDetailsSection {
  readonly root: Locator;
  readonly billingEqualsShippingCheckbox: Locator;
  readonly selectAddressButton: Locator;
  readonly selectedAddressLabel: Locator;
  readonly paymentMethodSelector: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.billingEqualsShippingCheckbox = root.getByTestId("billing-address-equals-shipping-checkbox");
    this.selectAddressButton = root.getByTestId("select-address-button");
    this.selectedAddressLabel = root.getByTestId("selected-address-label");
    this.paymentMethodSelector = root.getByTestId("payment-method-selector");
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
