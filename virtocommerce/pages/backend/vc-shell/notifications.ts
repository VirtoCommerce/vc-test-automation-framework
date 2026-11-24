import type { Locator, Page } from "@playwright/test";

/** Toast notifications of the admin UI. */
export class Notifications {
  readonly success: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    this.success = page.locator(".vc-notification--success");
    this.error = page.locator(".vc-notification--error");
  }
}
