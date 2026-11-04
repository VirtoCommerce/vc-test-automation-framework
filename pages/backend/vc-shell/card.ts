import type { Locator } from "@playwright/test";

import { expect } from "@playwright/test";

/** Collapsible titled card (section) of a blade. */
export class Card {
  readonly root: Locator;
  readonly header: Locator;
  readonly title: Locator;
  readonly body: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.header = root.locator("> .vc-card__header").first();
    this.title = root.locator("> .vc-card__header .vc-card__title").first();
    this.body = root.locator("> .vc-card__body").first();
  }

  /** Expands the card if collapsed and waits for `aria-expanded="true"`; safe to call when already expanded. */
  async expand(): Promise<void> {
    if ((await this.header.getAttribute("aria-expanded")) === "false") {
      await this.header.click();
      await expect(this.header).toHaveAttribute("aria-expanded", "true");
    }
  }
}

/** The card titled `title` inside `scope`, matched as contained text. */
export function cardTitled(scope: Locator, title: string): Card {
  return new Card(scope.locator(".vc-card__header").filter({ hasText: title }).locator("xpath=.."));
}
