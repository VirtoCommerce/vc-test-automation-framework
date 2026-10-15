import type { Locator, Page } from "@playwright/test";
import type { Card } from "./card";

import { cardTitled } from "./card";
import { DataGrid } from "./data-grid";
import { DatePicker } from "./date-picker";
import { Select } from "./select";
import { Switch } from "./switch";

const LABEL = ".vc-label";
const FIELD = ".vc-input, .vc-select, .vc-date-picker";

/** Class pattern of a disabled blade toolbar button, for `toHaveClass` assertions. */
export const DISABLED_TOOLBAR_BUTTON = /(^|\s)vc-blade-toolbar-base-button--disabled(\s|$)/;

/** Every open blade of the app; filter by what a blade holds to get one. */
export function blades(page: Page): Locator {
  return page.locator(".vc-blade");
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
    this.#toolbar = root.getByTestId("blade-toolbar");
  }

  /**
   * Toolbar button by item id; a disabled one carries {@link DISABLED_TOOLBAR_BUTTON}.
   * @param itemId - Toolbar item id, such as `save` or `add`.
   */
  toolbarButton(itemId: string): Locator {
    return this.#toolbar.getByTestId(itemId);
  }

  /** @param title - Card title, matched as contained text. */
  card(title: string): Card {
    return cardTitled(this.root, title);
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

  /** The blade's first toggle switch. */
  firstSwitch(): Switch {
    return new Switch(this.root);
  }
}
