import type { Locator } from "@playwright/test";

import { attributeSelector } from "../../../shared/selectors.ts";

/** Organizations menu opened from the main menu's organizations button, shown to members of several organizations. */
export class OrganizationsMenu {
  readonly button: Locator;
  readonly root: Locator;
  readonly organizationsEmptyList: Locator;
  readonly organizationOptions: Locator;
  readonly #searchInput: Locator;
  readonly #searchButton: Locator;

  /** @param root - Main layout: holds both the organizations button and the menu it opens. */
  constructor(root: Locator) {
    this.button = root.getByTestId("organizations-button");
    this.root = root.locator("[role='dialog']").filter({ has: root.page().getByTestId("organizations-list") });
    this.organizationsEmptyList = this.root.getByTestId("organizations-empty-list");
    this.organizationOptions = this.root.locator("[data-vc-organization-option] [role='option']");
    this.#searchInput = this.root.getByTestId("organizations-search").locator("input");
    this.#searchButton = this.root.getByTestId("organizations-search-button");
  }

  /** Clicks the organizations button and waits for the menu. */
  async open(): Promise<void> {
    await this.button.click();
    await this.root.waitFor();
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
