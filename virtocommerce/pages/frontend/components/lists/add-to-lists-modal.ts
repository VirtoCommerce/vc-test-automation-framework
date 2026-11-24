import type { Locator, Page } from "@playwright/test";

/** Modal that adds a product to lists or removes it from them, opened from a product card or page. */
export class AddToListsModal {
  readonly root: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.root = page.getByTestId("add-to-wishlists-modal");
    this.saveButton = this.root.getByTestId("wishlist-modal-save-button");
  }

  /** Checkbox of a list that does not hold the product yet; see {@link listWithProductCheckbox} for the others. */
  listCheckbox(listId: string): Locator {
    return this.root
      .locator("label")
      .filter({ has: this.root.page().getByTestId(`wishlist-modal-list-checkbox-${listId}`) });
  }

  /** Checkbox of a list that already holds the product; untick it to remove the product. */
  listWithProductCheckbox(listId: string): Locator {
    return this.root
      .locator("label")
      .filter({ has: this.root.page().getByTestId(`wishlist-modal-list-with-product-checkbox-${listId}`) });
  }
}
