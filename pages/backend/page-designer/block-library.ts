import type { Locator } from "@playwright/test";

const ADD_PREFIX = "Add ";

/** The designer's "Add block" panel: the shared components and the block types of the frontend's theme. */
export class BlockLibrary {
  readonly root: Locator;
  readonly searchBox: Locator;
  readonly cancelButton: Locator;
  /** One "Add <block>" button per listed block type. */
  readonly addButtons: Locator;
  readonly noBlocksMessage: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.searchBox = root.getByRole("searchbox", { name: "Search in library" });
    this.cancelButton = root.getByRole("button", { name: "Cancel" });
    this.addButtons = root.getByRole("button", { name: new RegExp(`^${ADD_PREFIX}`) });
    this.noBlocksMessage = root.getByText("No sections found");
  }

  /** Filters the list; the search box filters on key presses, so it fills and then presses a key. */
  async search(term: string): Promise<void> {
    await this.searchBox.fill(term);
    await this.searchBox.press("End");
  }

  /** Adds a block type where the panel was opened; its add button shows when the item is hovered. */
  async add(blockName: string): Promise<void> {
    await this.root.getByRole("button", { name: blockName, exact: true }).hover();
    await this.root.getByRole("button", { name: `${ADD_PREFIX}${blockName}`, exact: true }).click();
  }

  /** Names of the listed block types, in order. */
  async blockNames(): Promise<string[]> {
    const labels = await this.addButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label") ?? ""),
    );
    return labels.map((label) => label.slice(ADD_PREFIX.length));
  }
}
