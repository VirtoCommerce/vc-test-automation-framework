import type { Locator, Page } from "@playwright/test";

/** Admin UI popup that asks to confirm an action. */
export class ConfirmationPopup {
  readonly root: Locator;

  constructor(page: Page) {
    this.root = page.locator(".vc-popup");
  }

  /** Waits for the popup, clicks Confirm and waits until it is detached. */
  async confirm(): Promise<void> {
    await this.root.locator(".vc-popup__panel").waitFor({ state: "visible" });
    await this.root.locator(".vc-popup__footer button", { hasText: "Confirm" }).click();
    await this.root.waitFor({ state: "detached" });
  }
}
