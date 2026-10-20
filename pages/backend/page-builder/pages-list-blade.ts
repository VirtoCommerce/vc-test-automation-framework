import type { Locator } from "@playwright/test";

import { expect } from "@playwright/test";

import { whenResponse } from "../../responses";
import { Blade } from "../vc-shell/blade";
import { GridRow } from "../vc-shell/data-grid";
import { isPagesSearch } from "./requests";
import { Column } from "./routes";

const ROWS_TIMEOUT_MS = 10_000;

/** Blade listing pages, with a search box. */
export class PagesListBlade extends Blade {
  readonly searchInput: Locator;

  constructor(root: Locator) {
    super(root);
    this.searchInput = this.grid.searchInput;
  }

  /** Rows whose name cell equals `name` exactly, among the rows shown. */
  pageRows(name: string): Locator {
    return this.grid.rowsWhere(Column.name, name);
  }

  /** First row named `name`; use {@link reveal} first if the page may not be on the first grid page. */
  pageRow(name: string): GridRow {
    return new GridRow(this.pageRows(name).first());
  }

  /**
   * Types a search term, waits for the search response, then until the grid total matches its `totalCount`
   * (up to 10 s). Does nothing if the box already holds `term`.
   * @param term - Search term; `""` clears the search.
   */
  async search(term: string): Promise<void> {
    if ((await this.searchInput.inputValue()) === term) {
      return;
    }
    const response = await whenResponse(
      this.root.page(),
      (candidate) => isPagesSearch(candidate, term),
      () => this.searchInput.fill(term),
    );
    const body: unknown = await response.json();
    const totalCount = typeof body === "object" && body !== null ? Reflect.get(body, "totalCount") : undefined;
    if (typeof totalCount !== "number") {
      throw new Error(`Page search for "${term}" answered without a totalCount`);
    }
    await expect
      .poll(
        async () =>
          (await this.grid.totalCount()) === totalCount && (totalCount > 0 || (await this.grid.rows.count()) === 0),
        {
          message: `the grid shows the ${totalCount} found pages`,
          timeout: ROWS_TIMEOUT_MS,
        },
      )
      .toBe(true);
  }

  /**
   * Makes a page's row visible, searching by its name if it is not shown yet. Leaves the search applied.
   * @returns Whether the page is listed.
   */
  async reveal(name: string): Promise<boolean> {
    if ((await this.pageRows(name).count()) > 0) {
      return true;
    }
    await this.search(name);
    return (await this.pageRows(name).count()) > 0;
  }
}
