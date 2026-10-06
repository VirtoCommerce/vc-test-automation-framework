import type { Locator, Page } from "@playwright/test";

import { ConfirmationModal } from "../components/confirmation-modal";
import { LineItem, productItem, productItems } from "../components/line-item";
import { PaymentDetailsSection } from "../components/payment-details-section";
import { ShippingDetailsSection } from "../components/shipping-details-section";
import { MainLayout } from "../layouts/main-layout";

export const CONFIGURED_SKU_PREFIX = "Configuration-";

export class CartPage extends MainLayout {
  readonly path = "/cart";
  readonly shippingDetails: ShippingDetailsSection;
  readonly paymentDetails: PaymentDetailsSection;
  readonly products: Locator;
  readonly lineItems: Locator;
  readonly clearCartButton: Locator;
  readonly clearCartModal: ConfirmationModal;
  readonly checkoutButton: Locator;
  readonly placeOrderButton: Locator;

  constructor(page: Page) {
    super(page);
    this.shippingDetails = new ShippingDetailsSection(page.locator("[data-test-id='shipping-details-section']"));
    this.paymentDetails = new PaymentDetailsSection(page.locator("[data-test-id='payment-details-section']"));
    this.products = page.locator("[data-test-id='cart.products-section']");
    this.lineItems = productItems(this.products);
    this.clearCartButton = page.locator("[data-test-id='clear-cart-button']");
    this.clearCartModal = new ConfirmationModal(
      page.locator("[data-test-id='clear-cart-modal']"),
      "yes-button",
      "no-button",
    );
    this.checkoutButton = page.locator("[data-test-id='checkout-button']");
    this.placeOrderButton = page.locator("[data-test-id='place-order-button']");
  }

  lineItem(sku: string): LineItem {
    return new LineItem(productItem(this.products, sku));
  }

  configuredLineItems(productId: string): Locator {
    return productItem(this.products, `${CONFIGURED_SKU_PREFIX}${productId}`);
  }

  configuredLineItem(productId: string, text: string): LineItem {
    return new LineItem(this.configuredLineItems(productId).filter({ hasText: text }).first());
  }
}
