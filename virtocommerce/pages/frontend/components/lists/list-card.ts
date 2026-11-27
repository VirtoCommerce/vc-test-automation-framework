import type { Locator } from "@playwright/test";

/**
 * List card on the lists page. Its menu items are page-wide locators matched only while visible, so click
 * {@link menuButton} first.
 */
export class ListCard {
  readonly root: Locator;
  readonly menuButton: Locator;
  readonly editMenuItem: Locator;
  readonly shareMenuItem: Locator;
  readonly removeMenuItem: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.menuButton = root.getByTestId("wishlist-card-menu-button");
    const page = root.page();
    this.editMenuItem = page.getByTestId("wishlist-card-edit-menu-item").locator("button:visible");
    this.shareMenuItem = page.getByTestId("wishlist-card-share-menu-item").locator("button:visible");
    this.removeMenuItem = page.getByTestId("wishlist-card-remove-menu-item").locator("button:visible");
  }
}
