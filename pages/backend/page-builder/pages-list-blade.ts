import type { Locator, Response } from "@playwright/test";
import type { GridRow } from "../shell/data-grid";

import { expect } from "@playwright/test";

import { Blade } from "../shell/blade";
import { Column, ListToolbar } from "./constants";

const SEARCH_PATH = "/api/page-builder-pages/search";
const ROWS_TIMEOUT_MS = 10_000;

export function isPagesSearch(response: Response, keyword?: string): boolean {
  if (response.request().method() !== "POST" || new URL(response.url()).pathname !== SEARCH_PATH) {
    return false;
  }
  if (keyword === undefined) {
    return true;
  }
  const criteria = response.request().postDataJSON() as { readonly keyword?: string | null } | null;
  return (criteria?.keyword ?? "") === keyword;
}

export class PagesListBlade extends Blade {
  static readonly SEARCH_INPUT = ".vc-input input[placeholder='Search...']";
  readonly searchInput: Locator;

  constructor(root: Locator) {
    super(root);
    this.searchInput = root.locator(PagesListBlade.SEARCH_INPUT);
  }

  pageRows(name: string): Locator {
    return this.grid.rowsWhere(Column.name, name);
  }

  pageRow(name: string): GridRow {
    return this.grid.rowWhere(Column.name, name);
  }

  async names(): Promise<string[]> {
    return this.grid.values(Column.name);
  }

  async statuses(): Promise<string[]> {
    return this.grid.values(Column.status);
  }

  async search(term: string): Promise<void> {
    if ((await this.searchInput.inputValue()) === term) {
      return;
    }
    const [response] = await Promise.all([
      this.root.page().waitForResponse((candidate) => isPagesSearch(candidate, term)),
      this.searchInput.fill(term),
    ]);
    const { totalCount } = (await response.json()) as { readonly totalCount?: unknown };
    if (typeof totalCount !== "number") {
      throw new Error(`Page search for "${term}" answered without a totalCount`);
    }
    await this.expectRows(totalCount);
  }

  async clearSearch(): Promise<void> {
    await this.search("");
  }

  async hasPage(name: string): Promise<boolean> {
    return (await this.pageRows(name).count()) > 0;
  }

  async reveal(name: string): Promise<boolean> {
    if (await this.hasPage(name)) {
      return true;
    }
    await this.search(name);
    return this.hasPage(name);
  }

  async add(): Promise<void> {
    await this.toolbar.click(ListToolbar.add);
  }

  async openPage(name: string): Promise<void> {
    await this.reveal(name);
    await this.pageRows(name).click();
  }

  async #matchesTotal(expected: number): Promise<boolean> {
    const count = await this.grid.rows.count();
    if (expected === 0) {
      return count === 0;
    }
    const pagination = await this.grid.paginationInfo();
    return pagination === undefined
      ? count === expected
      : pagination.total === expected && count === pagination.last - pagination.first + 1;
  }

  async expectRows(expected: number): Promise<void> {
    await expect
      .poll(() => this.#matchesTotal(expected), {
        message: `the grid shows the ${expected} found pages`,
        timeout: ROWS_TIMEOUT_MS,
      })
      .toBe(true);
  }
}
