import type { Locator } from "@playwright/test";

import { expect } from "@playwright/test";

const DATE_NAVIGATION_STEPS = 24;

/** Date picker of a blade. */
export class DatePicker {
  readonly root: Locator;
  readonly input: Locator;
  readonly #menu: Locator;
  readonly #monthHeader: Locator;
  readonly #nextMonthButton: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.input = root.getByTestId("dp-input").first();
    this.#menu = root.page().locator(".dp__menu").first();
    this.#monthHeader = this.#menu.locator(".dp__month_year_wrap").first();
    this.#nextMonthButton = this.#menu.locator(".dp--arrow-btn-nav").last();
  }

  /**
   * Opens the calendar, pages forward to the date's month, picks the day and waits for the calendar to close.
   * @param date - Read in the test process's local time zone.
   * @throws Error when the date is before the calendar's shown month or 24+ months after it.
   */
  async select(date: Date): Promise<void> {
    await this.input.click();
    await this.#menu.waitFor({ state: "visible" });
    const cell = this.#menu
      .getByTestId(`dp-${isoDate(date)}`)
      .and(this.#menu.locator(":not(.dp__cell_offset)"))
      .filter({ hasNot: this.#menu.locator(".dp__cell_offset") });
    for (let step = 0; step < DATE_NAVIGATION_STEPS; step++) {
      if ((await cell.count()) > 0) {
        await cell.click();
        if (await this.#menu.isVisible()) {
          await this.root.page().keyboard.press("Escape");
        }
        await this.#menu.waitFor({ state: "hidden" });
        return;
      }
      const shownMonth = await this.#monthHeader.innerText();
      await this.#nextMonthButton.click();
      await expect(this.#monthHeader).not.toHaveText(shownMonth);
    }
    throw new Error(`Date ${isoDate(date)} is not reachable in the date picker`);
  }
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
