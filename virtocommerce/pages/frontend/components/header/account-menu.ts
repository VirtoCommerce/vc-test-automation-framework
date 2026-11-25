import type { Locator } from "@playwright/test";

/** Account menu opened from the account button. */
export class AccountMenu {
  readonly root: Locator;
  readonly dashboardLink: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.dashboardLink = root.getByTestId("dashboard-link");
  }
}
