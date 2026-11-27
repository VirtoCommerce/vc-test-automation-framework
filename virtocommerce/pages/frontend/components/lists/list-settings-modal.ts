import type { Locator, Page } from "@playwright/test";

/** Modal that creates or edits a list's name and description. */
export class ListSettingsModal {
  readonly root: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.root = page.locator("[role='dialog']").filter({ has: page.getByTestId("wishlist-name-input") });
    this.nameInput = this.root
      .getByTestId("wishlist-name-input")
      .and(page.locator("input"))
      .or(this.root.getByTestId("wishlist-name-input").locator("input"));
    this.descriptionInput = this.root.getByTestId("wishlist-description-input").locator("textarea");
    this.saveButton = this.root.getByTestId("wishlist-settings-save-button");
  }
}
