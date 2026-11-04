import type { Locator } from "@playwright/test";

import { expect } from "@playwright/test";

import { exactText } from "../../selectors";

const SELECT_TRANSITION = /select-dropdown-(enter|leave)-active/;
const SELECT_OPEN_ATTEMPT_TIMEOUT_MS = 5_000;

/** Dropdown select of a blade. */
export class Select {
  readonly root: Locator;
  readonly toggle: Locator;
  /** Page-wide: the options of whichever dropdown is open. */
  readonly options: Locator;
  /** Page-wide: the first open dropdown. */
  readonly dropdown: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.toggle = root.getByTestId("dropdown-toggle");
    this.options = root.page().getByTestId("option");
    this.dropdown = root.page().getByTestId("dropdown").first();
  }

  /** Reads the selected value as the toggle shows it, trimmed (no waiting). */
  async value(): Promise<string> {
    return (await this.toggle.innerText()).trim();
  }

  /** Opens the dropdown, reads every option's text, then closes it with Escape. */
  async optionTexts(): Promise<string[]> {
    await this.#open();
    const texts = (await this.options.allInnerTexts()).map((text) => text.trim());
    await this.root.page().keyboard.press("Escape");
    await this.dropdown.waitFor({ state: "hidden" });
    return texts;
  }

  /**
   * Opens the dropdown (retrying until it shows) and clicks an option.
   * @param option - Option text, matched exactly.
   */
  async select(option: string): Promise<void> {
    await this.#open();
    await this.options
      .filter({ hasText: exactText(option) })
      .first()
      .click();
  }

  async #open(): Promise<void> {
    await expect(async () => {
      if (!(await this.dropdown.isVisible())) {
        await this.toggle.click();
      }
      await expect(this.dropdown).toBeVisible({ timeout: SELECT_OPEN_ATTEMPT_TIMEOUT_MS });
    }).toPass();
    await expect(this.dropdown).not.toHaveClass(SELECT_TRANSITION);
  }
}
