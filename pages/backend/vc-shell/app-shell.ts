import type { Locator, Page } from "@playwright/test";

/** Side menu of the app; items may show a counter badge. */
export class AppMenu {
  readonly items: Locator;

  constructor(page: Page) {
    this.items = page.locator(".vc-menu-item");
  }

  /**
   * Reads a menu item's badge counter right now (no waiting); `undefined` when it shows no badge.
   * @param routeId - Menu item id, such as `DraftPagesList`.
   * @throws Error when the badge does not show a number.
   */
  async counter(routeId: string): Promise<number | undefined> {
    const badge = this.items.and(this.items.page().getByTestId(routeId)).locator(".vc-badge__text");
    if ((await badge.count()) === 0) {
      return undefined;
    }
    const text = (await badge.first().innerText()).trim();
    if (!/^\d+$/.test(text)) {
      throw new Error(`The ${routeId} menu badge shows "${text}", not a number`);
    }
    return Number(text);
  }
}

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
