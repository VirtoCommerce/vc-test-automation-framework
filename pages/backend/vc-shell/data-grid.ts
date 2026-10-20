import type { Locator } from "@playwright/test";

import { exactText } from "../../selectors";

const DATA_ROW = "[role='row']:has([role='cell']):has([data-column-id])";
const HEADER_ROW = "[role='row']:has([role='columnheader'])";
const RANGE = /(\d+)\s*\D\s*(\d+)\s+of\s+(\d+)/;

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
  /** The grid's search box. */
  readonly searchInput: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.rows = root.locator(DATA_ROW);
    this.header = root.locator(HEADER_ROW);
    this.pagination = root.locator(".vc-data-table__pagination");
    this.searchInput = searchInputIn(root);
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

/** Search boxes of data grids inside `scope`; a page as scope matches them anywhere, e.g. to find a blade by it. */
export function searchInputIn(scope: Pick<Locator, "locator">): Locator {
  return scope.locator(".vc-input input[placeholder='Search...']");
}
