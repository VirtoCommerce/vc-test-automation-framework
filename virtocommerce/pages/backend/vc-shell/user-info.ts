import type { Locator, Page } from "@playwright/test";

/** Signed-in user and the app logo in the sidebar header. */
export class UserInfo {
  readonly logo: Locator;
  readonly name: Locator;
  readonly role: Locator;

  constructor(page: Page) {
    this.logo = page.locator(".sidebar-header__logo-image");
    this.name = page.locator(".vc-user-info__name");
    this.role = page.locator(".vc-user-info__role");
  }
}
