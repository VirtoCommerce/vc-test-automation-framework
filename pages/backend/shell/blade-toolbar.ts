import type { Locator } from "@playwright/test";

import { expect } from "@playwright/test";

const DISABLED_TOOLBAR_BUTTON = /(^|\s)vc-blade-toolbar-base-button--disabled(\s|$)/;

export async function expectToolbarButtonEnabled(button: Locator): Promise<void> {
  await expect(button).not.toHaveClass(DISABLED_TOOLBAR_BUTTON);
}

export async function expectToolbarButtonDisabled(button: Locator): Promise<void> {
  await expect(button).toHaveClass(DISABLED_TOOLBAR_BUTTON);
}

export class BladeToolbar {
  readonly root: Locator;

  constructor(root: Locator) {
    this.root = root;
  }

  button(itemId: string): Locator {
    return this.root.locator(`[data-test-id='${itemId}']`);
  }

  async click(itemId: string): Promise<void> {
    await this.button(itemId).click();
  }
}
