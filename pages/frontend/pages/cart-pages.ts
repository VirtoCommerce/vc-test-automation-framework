import type { Locator, Page } from "@playwright/test";
import type { Env } from "@core/env";
import type { QuantityControlKind } from "../components/controls";

import { PaymentDetailsSection, ShippingDetailsSection } from "../components/checkout";
import { ConfirmationModal } from "../components/controls";
import { LineItem, productItem, productItems } from "../components/product";
import { FrontendPage } from "./layout";
import { CheckoutCompletedPage } from "./site-pages";

/** Checkout mode: everything on the cart page, or multi-step over shipping, payment and review pages. */
export type CheckoutMode = Env["checkoutMode"];

/** Cart page; in single-page checkout mode it also holds the shipping and payment sections ({@link CheckoutFlow}). */
export class CartPage extends FrontendPage {
  readonly path = "/cart";
  /** Products section; scope for line items. */
  readonly products: Locator;
  readonly lineItems: Locator;
  readonly clearCartButton: Locator;
  readonly clearCartModal: ConfirmationModal;
  /** Leads to the shipping page in multi-step checkout mode; prefer {@link CheckoutFlow.start}. */
  readonly checkoutButton: Locator;
  readonly #quantityControl: QuantityControlKind;

  constructor(page: Page, quantityControl: QuantityControlKind) {
    super(page);
    this.#quantityControl = quantityControl;
    this.products = page.locator("[data-test-id='cart.products-section']");
    this.lineItems = productItems(this.products);
    this.clearCartButton = page.locator("[data-test-id='clear-cart-button']");
    this.clearCartModal = new ConfirmationModal(page.locator("[data-test-id='clear-cart-modal']"), "yes-button");
    this.checkoutButton = page.locator("[data-test-id='checkout-button']");
  }

  /**
   * @param sku - Product SKU, or `Configuration-<code>` for a configured product; with several configured items of one
   * product, use {@link configuredLineItem}.
   */
  lineItem(sku: string): LineItem {
    return new LineItem(productItem(this.products, sku), this.#quantityControl);
  }

  /**
   * First configured line item of a product whose text contains `text`; expand the components first with
   * {@link expandComponentsOf}.
   * @param sku - `Configuration-<code>`.
   * @param text - Text of one of its components, such as a memory option.
   */
  configuredLineItem(sku: string, text: string): LineItem {
    return new LineItem(productItem(this.products, sku).filter({ hasText: text }).first(), this.#quantityControl);
  }

  /**
   * Expands the component list of every configured line item of a product.
   * @param sku - `Configuration-<code>`.
   */
  async expandComponentsOf(sku: string): Promise<void> {
    const items = productItem(this.products, sku);
    for (let index = 0; index < (await items.count()); index++) {
      await new LineItem(items.nth(index), this.#quantityControl).expandComponents();
    }
  }
}

/** Account's saved-for-later page. */
export class SavedForLaterPage extends FrontendPage {
  readonly path = "/account/saved-for-later";
  readonly lineItems: Locator;
  readonly removeItemModal: ConfirmationModal;
  readonly #quantityControl: QuantityControlKind;

  constructor(page: Page, quantityControl: QuantityControlKind) {
    super(page);
    this.#quantityControl = quantityControl;
    this.lineItems = productItems(this.root);
    this.removeItemModal = new ConfirmationModal(
      page.locator("[data-test-id='delete-wishlist-product-modal']"),
      "delete-button",
    );
  }

  lineItem(sku: string): LineItem {
    return new LineItem(productItem(this.root, sku), this.#quantityControl);
  }
}

/**
 * Checkout for either configured mode: the same calls run it on the cart page alone (single-page) or across the
 * shipping, payment and review pages (multi-step). Call the steps in order; the cart must already hold items.
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
    this.shippingDetails = new ShippingDetailsSection(page.locator("[data-test-id='shipping-details-section']"));
    this.paymentDetails = new PaymentDetailsSection(page.locator("[data-test-id='payment-details-section']"));
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
      await this.#page.locator("[data-test-id='billing-button']").click();
    }
    await this.paymentDetails.root.waitFor();
  }

  /**
   * Clicks place order (after the review page in multi-step mode). Does not wait for the result; assert
   * {@link completedPage} or wait for its URL.
   */
  async placeOrder(): Promise<void> {
    if (this.mode === "multi-step") {
      await this.#page.locator("[data-test-id='review-order-button']").click();
    }
    await this.#page.locator("[data-test-id='place-order-button']").click();
  }
}
