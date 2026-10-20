import type { Locator, Page } from "@playwright/test";

import { MainLayout } from "../../layouts/main-layout";

/** Page shown after an order is placed. */
export class CheckoutCompletedPage extends MainLayout {
  readonly path = "/checkout/completed";
  /** Carries the order number in `data-order-number`. */
  readonly orderNumberLabel: Locator;

  constructor(page: Page) {
    super(page);
    this.orderNumberLabel = page.locator("[data-order-number]");
  }
}
