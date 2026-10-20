import type { Locator, Page } from "@playwright/test";

import { CouponCard } from "../../components/coupons";
import { MainLayout } from "../../layouts/main-layout";

/** Account coupons page: the store's coupons the signed-in customer can use, each with a copy button. */
export class CouponsPage extends MainLayout {
  readonly path = "/account/coupons";
  readonly cards: Locator;

  constructor(page: Page) {
    super(page);
    this.cards = page.locator(".coupon-item");
  }

  card(index: number): CouponCard {
    return new CouponCard(this.cards.nth(index));
  }

  /** Reads the clipboard; needs the `clipboard-read` permission. */
  clipboardText(): Promise<string> {
    return this.page.evaluate(() => navigator.clipboard.readText());
  }
}
