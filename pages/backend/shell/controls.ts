import type { Locator, Page } from "@playwright/test";

import { expect } from "@playwright/test";

import { exactText } from "../../selectors";

const SELECT_TRANSITION = /select-dropdown-(enter|leave)-active/;
const SELECT_OPEN_ATTEMPT_TIMEOUT_MS = 5_000;
const DATE_NAVIGATION_STEPS = 24;
const DATA_ROW = "[role='row']:has([role='cell']):has([data-column-id])";
const HEADER_ROW = "[role='row']:has([role='columnheader'])";
const RANGE = /(\d+)\s*\D\s*(\d+)\s+of\s+(\d+)/;
const LABEL = ".vc-label";
const FIELD = ".vc-input, .vc-select, .vc-date-picker";

/** Class pattern of a disabled blade toolbar button, for `toHaveClass` assertions. */
export const DISABLED_TOOLBAR_BUTTON = /(^|\s)vc-blade-toolbar-base-button--disabled(\s|$)/;

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
    this.toggle = root.locator("[data-test-id='dropdown-toggle']");
    this.options = root.page().locator("[data-test-id='option']");
    this.dropdown = root.page().locator("[data-test-id='dropdown']").first();
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

/** Date picker of a blade. */
export class DatePicker {
  readonly root: Locator;
  readonly input: Locator;
  readonly #menu: Locator;
  readonly #monthHeader: Locator;
  readonly #nextMonthButton: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.input = root.locator("[data-test-id='dp-input']").first();
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
    const cell = this.#menu.locator(
      `[data-test-id='dp-${isoDate(date)}']:not(.dp__cell_offset):not(:has(.dp__cell_offset))`,
    );
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

/** Admin UI popup that asks to confirm an action. */
export class ConfirmationPopup {
  readonly root: Locator;

  constructor(page: Page) {
    this.root = page.locator(".vc-popup");
  }

  /** Waits for the popup, clicks Confirm and waits until it is detached. */
  async confirm(): Promise<void> {
    await this.root.locator(".vc-popup__panel").waitFor({ state: "visible" });
    await this.root.locator(".vc-popup__footer button", { hasText: "Confirm" }).click();
    await this.root.waitFor({ state: "detached" });
  }
}

/** Toast notifications of the admin UI. */
export class Notifications {
  readonly success: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    this.success = page.locator(".vc-notification--success");
    this.error = page.locator(".vc-notification--error");
  }
}

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
    const badge = this.items.and(this.items.page().locator(`[data-test-id='${routeId}']`)).locator(".vc-badge__text");
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

/** Row of a blade's data grid; cells are addressed by `data-column-id`. */
export class GridRow {
  readonly root: Locator;

  constructor(root: Locator) {
    this.root = root;
  }

  cell(columnId: string): Locator {
    return this.root.locator(`[data-column-id='${columnId}']`);
  }

  /** Reads a cell's trimmed text right now (no waiting). */
  async value(columnId: string): Promise<string> {
    return (await this.cell(columnId).innerText()).trim();
  }
}

/** Data grid of a blade, with pagination; columns are addressed by `data-column-id`. */
export class DataGrid {
  readonly root: Locator;
  /** Data rows on the current grid page. */
  readonly rows: Locator;
  readonly header: Locator;
  readonly pagination: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.rows = root.locator(DATA_ROW);
    this.header = root.locator(HEADER_ROW);
    this.pagination = root.locator(".vc-data-table__pagination");
  }

  columnHeader(columnId: string): Locator {
    return this.header.locator(`[data-column-id='${columnId}']`);
  }

  /** Rows whose cell in `columnId` has exactly the text `value` (surrounding white space ignored). */
  rowsWhere(columnId: string, value: string): Locator {
    return this.rows.filter({
      has: this.root.page().locator(`[data-column-id='${columnId}']`, { hasText: exactText(value) }),
    });
  }

  /** Reads the trimmed texts of a column on the current grid page (no waiting). */
  async values(columnId: string): Promise<string[]> {
    return (await this.rows.locator(`[data-column-id='${columnId}']`).allInnerTexts()).map((text) => text.trim());
  }

  /** Total rows across all grid pages: the pagination's "of N", or the shown row count without pagination. */
  async totalCount(): Promise<number> {
    if ((await this.pagination.count()) > 0) {
      const match = RANGE.exec(await this.pagination.first().innerText());
      if (match?.[3] !== undefined) {
        return Number(match[3]);
      }
    }
    return this.rows.count();
  }
}

/** Admin UI blade: title, toolbar, labelled fields and data grid. Field lookups match a label by contained text. */
export class Blade {
  readonly root: Locator;
  readonly title: Locator;
  readonly grid: DataGrid;
  readonly #toolbar: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.title = root.locator(".vc-blade-header__title");
    this.grid = new DataGrid(root);
    this.#toolbar = root.locator("[data-test-id='blade-toolbar']");
  }

  /**
   * Toolbar button by item id; a disabled one carries {@link DISABLED_TOOLBAR_BUTTON}.
   * @param itemId - Toolbar item id, such as `save` or `add`.
   */
  toolbarButton(itemId: string): Locator {
    return this.#toolbar.locator(`[data-test-id='${itemId}']`);
  }

  /** @param title - Card title, matched as contained text. */
  card(title: string): Card {
    return new Card(this.root.locator(".vc-card__header").filter({ hasText: title }).locator("xpath=.."));
  }

  /** Input, select or date picker wrapper by label, such as `Name*`. */
  field(label: string): Locator {
    return this.root.locator(FIELD).filter({ has: this.root.page().locator(LABEL, { hasText: label }) });
  }

  /** First `input` of the field labelled `label`. */
  textInput(label: string): Locator {
    return this.field(label).locator("input").first();
  }

  select(label: string): Select {
    return new Select(
      this.root.locator(".vc-select").filter({ has: this.root.page().locator(LABEL, { hasText: label }) }),
    );
  }

  datePicker(label: string): DatePicker {
    return new DatePicker(this.field(label));
  }
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
