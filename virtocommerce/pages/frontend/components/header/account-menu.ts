import type { Locator } from "@playwright/test";

import { attributeSelector } from "../../../shared/selectors.ts";

/** Account menu opened from the account button; lists the user's organizations. */
export class AccountMenu {
  readonly root: Locator;
  readonly dashboardLink: Locator;
  readonly organizationsEmptyList: Locator;
  readonly organizationOptions: Locator;
  readonly #searchInput: Locator;
  readonly #searchButton: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.dashboardLink = root.getByTestId("dashboard-link");
    this.organizationsEmptyList = root.getByTestId("organizations-empty-list");
    this.organizationOptions = root.locator("[data-vc-organization-option] [role='option']");
    this.#searchInput = root.getByTestId("organizations-search").locator("input");
    this.#searchButton = root.getByTestId("organizations-search-button");
  }

  /** Organization entry matched by its exact `data-organization-name`. */
  organization(name: string): Locator {
    return this.root.locator(attributeSelector({ "data-organization-name": name }));
  }

  /** Clickable option that switches to the organization; disabled for a locked membership. */
  organizationOption(name: string): Locator {
    return this.root.locator(`[role='option']:has(${attributeSelector({ "data-organization-name": name })})`);
  }

  /** Types a term into the organization search and clicks search; does not wait for the results. */
  async searchOrganizations(term: string): Promise<void> {
    await this.#searchInput.fill(term);
    await this.#searchButton.click();
  }
}
