import type { Locator, Page } from "@playwright/test";

/** List sharing scope, as the platform names it. */
export type ListScope = "Private" | "Organization" | "AnyoneAnonymous";

/** Modal that sets a list's sharing scope; making a shared list private asks for {@link stopSharingButton}. */
export class ListSharingModal {
  readonly root: Locator;
  readonly saveButton: Locator;
  /** Confirm button of the "Stop sharing this list?" dialog. */
  readonly stopSharingButton: Locator;

  constructor(page: Page) {
    this.root = page.locator("[role='dialog']").filter({
      has: page.getByTestId("wishlist-sharing-save-button"),
    });
    this.saveButton = this.root.getByTestId("wishlist-sharing-save-button");
    this.stopSharingButton = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: "Stop sharing this list?" }) })
      .getByRole("button", { name: "Stop sharing" });
  }

  option(scope: ListScope): Locator {
    return this.root.getByTestId(`wishlist-sharing-scope-${scope}`);
  }
}
