import type { Locator, Page } from "@playwright/test";

/** List sharing scope, as the platform names it. */
export type ListScope = "Private" | "Organization" | "AnyoneAnonymous";

/** Modal that adds a product to lists or removes it from them, opened from a product card or page. */
export class AddToListsModal {
  readonly root: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.root = page.locator("[data-test-id='add-to-wishlists-modal']");
    this.saveButton = this.root.locator("[data-test-id='wishlist-modal-save-button']");
  }

  /** Checkbox of a list that does not hold the product yet; see {@link listWithProductCheckbox} for the others. */
  listCheckbox(listId: string): Locator {
    return this.root.locator(`label:has([data-test-id='wishlist-modal-list-checkbox-${listId}'])`);
  }

  /** Checkbox of a list that already holds the product; untick it to remove the product. */
  listWithProductCheckbox(listId: string): Locator {
    return this.root.locator(`label:has([data-test-id='wishlist-modal-list-with-product-checkbox-${listId}'])`);
  }
}

/** Modal that creates or edits a list's name and description. */
export class ListSettingsModal {
  readonly root: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.root = page.locator("[role='dialog']").filter({ has: page.locator("[data-test-id='wishlist-name-input']") });
    this.nameInput = this.root.locator(
      "input[data-test-id='wishlist-name-input'], [data-test-id='wishlist-name-input'] input",
    );
    this.descriptionInput = this.root.locator("[data-test-id='wishlist-description-input'] textarea");
    this.saveButton = this.root.locator("[data-test-id='wishlist-settings-save-button']");
  }
}

/** Modal that sets a list's sharing scope; making a shared list private asks for {@link stopSharingButton}. */
export class ListSharingModal {
  readonly root: Locator;
  readonly saveButton: Locator;
  /** Confirm button of the "Stop sharing this list?" dialog. */
  readonly stopSharingButton: Locator;

  constructor(page: Page) {
    this.root = page.locator("[role='dialog']").filter({
      has: page.locator("[data-test-id='wishlist-sharing-save-button']"),
    });
    this.saveButton = this.root.locator("[data-test-id='wishlist-sharing-save-button']");
    this.stopSharingButton = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: "Stop sharing this list?" }) })
      .getByRole("button", { name: "Stop sharing" });
  }

  option(scope: ListScope): Locator {
    return this.root.locator(`[data-test-id='wishlist-sharing-scope-${scope}']`);
  }
}

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
    this.menuButton = root.locator("[data-test-id='wishlist-card-menu-button']");
    const page = root.page();
    this.editMenuItem = page.locator("[data-test-id='wishlist-card-edit-menu-item'] button:visible");
    this.shareMenuItem = page.locator("[data-test-id='wishlist-card-share-menu-item'] button:visible");
    this.removeMenuItem = page.locator("[data-test-id='wishlist-card-remove-menu-item'] button:visible");
  }
}
