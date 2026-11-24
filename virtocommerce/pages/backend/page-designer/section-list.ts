import type { Locator } from "@playwright/test";

import { SECTION_ID, SectionRow } from "./section-row.ts";

/**
 * The designer's "Page sections" list. Find a section by position with {@link row}; ids of sections created in the
 * designer are random, so read them with {@link ids}.
 */
export class SectionList {
  readonly root: Locator;
  readonly rows: Locator;
  readonly insertAtBeginningButton: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.rows = root.locator(":scope > app-collapsible-list-item");
    this.insertAtBeginningButton = root.getByRole("button", { name: "Insert section at the beginning" });
  }

  row(index: number): SectionRow {
    return new SectionRow(this.rows.nth(index));
  }

  /** Section ids in list order. */
  async ids(): Promise<string[]> {
    const titles = await this.rows.evaluateAll((rows) =>
      rows.map((row) => row.querySelector("button[title]:not([title=''])")?.getAttribute("title") ?? ""),
    );
    return titles.map((title) => SECTION_ID.exec(title)?.[1] ?? title);
  }

  /** Opens the block library to insert a section after the one at `index`; the button shows on hover. */
  async insertAfter(index: number): Promise<void> {
    await this.row(index).editButton.hover();
    await this.root.getByRole("button", { name: `Insert section after section ${index + 1}`, exact: true }).click();
  }
}
