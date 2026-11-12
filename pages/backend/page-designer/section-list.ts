import type { Locator } from "@playwright/test";

/** Items of a section's actions menu. */
export const SectionAction = {
  hide: "Hide",
  show: "Show",
  copy: "Copy",
  pasteBefore: "Paste before",
  pasteAfter: "Paste after",
  duplicate: "Duplicate",
  delete: "Delete",
} as const;

export type SectionActionName = (typeof SectionAction)[keyof typeof SectionAction];

const SECTION_ID = /\(([^()]+)\)$/;
const DRAG_STEPS = 12;

/** One section of the designer's section list. */
export class SectionRow {
  readonly root: Locator;
  /** Opens the section editor; its title is "<type> (<section id>)". */
  readonly editButton: Locator;
  readonly selectCheckbox: Locator;
  readonly actionsButton: Locator;
  readonly moveHandle: Locator;
  /** The open actions menu; there is one at a time. Item text includes icon names, so match items by name. */
  readonly menu: Locator;
  readonly menuItems: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.editButton = root.getByTitle(SECTION_ID).first();
    this.selectCheckbox = root.getByRole("checkbox", { name: /^Select / }).first();
    this.actionsButton = root.getByRole("button", { name: /^Actions for / }).first();
    this.moveHandle = root.getByRole("button", { name: /^Move section \d+$/ }).first();
    this.menu = root.page().getByRole("menu");
    this.menuItems = this.menu.getByRole("menuitem");
  }

  async openMenu(): Promise<void> {
    await this.actionsButton.click();
    await this.menu.waitFor({ state: "visible" });
  }

  /** Runs an item of the section's actions menu; Delete then asks for confirmation, see {@link delete}. */
  async act(action: SectionActionName): Promise<void> {
    await this.openMenu();
    await this.menu.getByRole("menuitem", { name: action, exact: true }).click();
  }

  /** Deletes the section and confirms. */
  async delete(): Promise<void> {
    await this.act(SectionAction.delete);
    await this.#confirmation("OK").click();
  }

  /** Chooses Delete and cancels the confirmation, keeping the section. */
  async cancelDelete(): Promise<void> {
    await this.act(SectionAction.delete);
    await this.#confirmation("Cancel").click();
  }

  /** Drags the section by its handle just below `target`, in small steps so the drag list follows. */
  async dragBelow(target: SectionRow): Promise<void> {
    const mouse = this.root.page().mouse;
    const from = await boxOf(this.moveHandle);
    const to = await boxOf(target.moveHandle);
    const x = from.x + from.width / 2;
    const startY = from.y + from.height / 2;
    const endY = to.y + to.height;
    await mouse.move(x, startY);
    await mouse.down();
    for (let step = 1; step <= DRAG_STEPS; step++) {
      await mouse.move(x, startY + ((endY - startY) * step) / DRAG_STEPS);
    }
    await mouse.up();
  }

  #confirmation(button: "OK" | "Cancel"): Locator {
    return this.root.page().getByRole("dialog").getByRole("button", { name: button, exact: true });
  }

  /** Moves the section one place down with the keyboard on its handle. */
  async moveDown(): Promise<void> {
    await this.moveHandle.focus();
    await this.moveHandle.press("ArrowDown");
  }
}

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

async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(`${locator} is not visible`);
  }
  return box;
}
