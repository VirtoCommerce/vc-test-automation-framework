import type { Locator, Page } from "@playwright/test";

import { TopHeader } from "../components/header";

/** Base of frontend pages: main layout, top header and cart badge; open the page with {@link navigate}. */
export abstract class FrontendPage {
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
    this.topHeader = new TopHeader(page.locator("[data-test-id='top-header']"));
    this.cartQuantityLabel = page.locator("[data-test-id='desktop-main-menu-cart-link'] .vc-badge__content");
  }

  /** Goes to {@link path} and waits for the `load` event only; wait for page content with assertions. */
  async navigate(): Promise<void> {
    await this.page.goto(this.path, { waitUntil: "load" });
  }
}
