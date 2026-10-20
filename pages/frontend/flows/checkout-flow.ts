import type { Page } from "@playwright/test";
import type { Env } from "@core/env";
import type { QuantityControlKind } from "../ui-kit/quantity-control";

import { PaymentDetailsSection, ShippingDetailsSection } from "../components/checkout";
import { CartPage } from "../pages/cart/cart-page";
import { CheckoutCompletedPage } from "../pages/checkout/checkout-completed-page";

/** Checkout mode: everything on the cart page, or multi-step over shipping, payment and review pages. */
export type CheckoutMode = Env["checkoutMode"];

/**
 * Checkout for either configured mode: the same calls run it on the cart page alone (single-page) or across the
 * shipping, payment and review pages (multi-step, in the frontend's secure layout). Call the steps in order; the cart
 * must already hold items.
 *
 * @example
 * const checkout = frontend.checkout();
 * await checkout.start();
 * await checkout.continueToPayment();
 * await checkout.placeOrder();
 */
export class CheckoutFlow {
  readonly mode: CheckoutMode;
  readonly cartPage: CartPage;
  readonly shippingDetails: ShippingDetailsSection;
  readonly paymentDetails: PaymentDetailsSection;
  /** Shown after {@link placeOrder}; carries the order number. */
  readonly completedPage: CheckoutCompletedPage;
  readonly #page: Page;

  constructor(page: Page, mode: CheckoutMode, quantityControl: QuantityControlKind) {
    this.#page = page;
    this.mode = mode;
    this.cartPage = new CartPage(page, quantityControl);
    this.completedPage = new CheckoutCompletedPage(page);
    this.shippingDetails = new ShippingDetailsSection(page.getByTestId("shipping-details-section"));
    this.paymentDetails = new PaymentDetailsSection(page.getByTestId("payment-details-section"));
  }

  /** Opens the cart (and in multi-step mode clicks checkout), then waits for the shipping section. */
  async start(): Promise<void> {
    await this.cartPage.navigate();
    if (this.mode === "multi-step") {
      await this.cartPage.checkoutButton.click();
    }
    await this.shippingDetails.root.waitFor();
  }

  /** Waits for the payment section, first clicking through to the billing page in multi-step mode. */
  async continueToPayment(): Promise<void> {
    if (this.mode === "multi-step") {
      await this.#page.getByTestId("billing-button").click();
    }
    await this.paymentDetails.root.waitFor();
  }

  /**
   * Clicks place order (after the review page in multi-step mode). Does not wait for the result; assert
   * {@link completedPage} or wait for its URL.
   */
  async placeOrder(): Promise<void> {
    if (this.mode === "multi-step") {
      await this.#page.getByTestId("review-order-button").click();
    }
    await this.#page.getByTestId("place-order-button").click();
  }
}
