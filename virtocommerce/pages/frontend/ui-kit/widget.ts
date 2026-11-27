import type { Locator } from "@playwright/test";

/** Collapsible widget (`VcWidget`), such as a product configuration section or a category filter. */
export class Widget {
  readonly root: Locator;
  readonly header: Locator;
  /** Widget body; hidden while the widget is collapsed. */
  readonly content: Locator;

  /** @param root - The widget element itself; use {@link widgetIn} for an element that holds one. */
  constructor(root: Locator) {
    this.root = root;
    this.header = root.locator(".vc-widget__header-container").first();
    this.content = root.locator(".vc-widget__slot-container").first();
  }

  /**
   * Clicks the header if the widget is collapsed; does not wait for the body to show. Reads the collapsed class, not
   * the body's visibility, since a body still loading has no size and would look collapsed.
   */
  async expand(): Promise<void> {
    if (await this.root.evaluate((element) => element.classList.contains("vc-widget--collapsed"))) {
      await this.header.click();
    }
  }
}

/** The first widget inside `scope`, such as a category filter's. */
export function widgetIn(scope: Locator): Widget {
  return new Widget(scope.locator(".vc-widget").first());
}
