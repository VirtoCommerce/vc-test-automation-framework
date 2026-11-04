import type { Locator, Page } from "@playwright/test";
import type { PageBuilderPageType } from "./routes";

import { exactText } from "../../selectors";

/**
 * Popup that asks for the type of a new page, opened by the page list's add button. The module gives it no
 * `data-test-id`s, so it is located by its CSS classes.
 */
export class AddPagePopup {
  readonly root: Locator;

  constructor(page: Page) {
    this.root = page.locator(".add-page-popup");
  }

  /** Clicks the option of a page type; does not wait for the details blade. */
  async choose(type: PageBuilderPageType): Promise<void> {
    await this.root
      .locator(".add-page-popup__option")
      .filter({ has: this.root.page().locator(".add-page-popup__title", { hasText: exactText(type) }) })
      .click();
  }
}
