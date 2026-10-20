import type { Locator, Page } from "@playwright/test";

import { TopHeader } from "../components/header";
import { badgeContent } from "../ui-kit/badge";

/**
 * Base of frontend pages in the main layout (`MainLayout`): top header and cart badge; open the page with
 * {@link navigate}. The multi-step checkout steps use the frontend's secure layout instead and are driven by
 * `CheckoutFlow`.
 */
export abstract class MainLayout {
  readonly page: Page;
  /** Main layout; scope for the page's own content. */
  readonly root: Locator;
  readonly topHeader: TopHeader;
  /** Cart badge in the desktop main menu: the number of items in the cart. */
  readonly cartQuantityLabel: Locator;
  /** Path relative to the frontend base URL. */
  abstract readonly path: string;

  constructor(page: Page) {
    this.page = page;
    this.root = page.locator(".main-layout");
    this.topHeader = new TopHeader(page.getByTestId("top-header"));
    this.cartQuantityLabel = badgeContent(page.getByTestId("desktop-main-menu-cart-link"));
  }

  /** Goes to {@link path} and waits for the `load` event only; wait for page content with assertions. */
  async navigate(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: "load" });
  }
}
