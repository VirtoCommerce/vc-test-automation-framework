import type { Locator } from "@playwright/test";

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
