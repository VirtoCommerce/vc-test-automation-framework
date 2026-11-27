import type { Locator } from "@playwright/test";

/** A coupon card of the account coupons page. */
export class CouponCard {
  readonly root: Locator;
  /** Copies the code to the clipboard. */
  readonly codeButton: Locator;
  readonly code: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.codeButton = root.locator(".coupon-item__code-button");
    this.code = root.locator(".coupon-item__code-value");
  }
}
