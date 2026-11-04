import type { Locator, Page } from "@playwright/test";
import type { QuantityControlKind } from "../../ui-kit/quantity-control";

import { productItem, productItems } from "../../components/catalog/product-items";
import { CartCouponSection } from "../../components/coupons";
import { LineItem } from "../../components/line-item";
import { MainLayout } from "../../layouts/main-layout";
import { ConfirmationModal } from "../../ui-kit/confirmation-modal";

/** Cart page; in single-page checkout mode it also holds the shipping and payment sections (`CheckoutFlow`). */
export class CartPage extends MainLayout {
  readonly path = "/cart";
  /** Products section; scope for line items. */
  readonly products: Locator;
  readonly lineItems: Locator;
  readonly clearCartButton: Locator;
  readonly clearCartModal: ConfirmationModal;
  /** Leads to the shipping page in multi-step checkout mode; prefer `CheckoutFlow.start`. */
  readonly checkoutButton: Locator;
  readonly couponSection: CartCouponSection;
  /** Grand total of the order summary, as shown; read it as a number with {@link totalAmount}. */
  readonly totalLabel: Locator;
  readonly #quantityControl: QuantityControlKind;

  constructor(page: Page, quantityControl: QuantityControlKind) {
    super(page);
    this.#quantityControl = quantityControl;
    this.products = page.getByTestId("cart.products-section");
    this.lineItems = productItems(this.products);
    this.clearCartButton = page.getByTestId("clear-cart-button");
    this.clearCartModal = new ConfirmationModal(page.getByTestId("clear-cart-modal"), "yes-button");
    this.checkoutButton = page.getByTestId("checkout-button");
    this.couponSection = new CartCouponSection(page.locator(".coupons-section"));
    this.totalLabel = page.getByTestId("cart-total-label");
  }

  /** The grand total as a number, read from {@link totalLabel} without currency sign and thousands separators. */
  async totalAmount(): Promise<number> {
    return Number((await this.totalLabel.innerText()).replace(/[^\d.-]/g, ""));
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
