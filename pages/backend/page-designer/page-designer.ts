import type { FrameLocator, Locator, Page } from "@playwright/test";

import { whenResponse } from "../../responses";
import { isPagePublishing } from "../page-builder/requests";
import { BlockLibrary } from "./block-library";
import { DesignerPanel } from "./designer-panel";
import { isDesignerSave } from "./requests";
import { SectionList } from "./section-list";

/** Path of the page designer app on the platform. */
export const DESIGNER_PATH = "/Modules/$(VirtoCommerce.PageBuilderModule)/Content/page-builder-designer/index.html";

/** Viewports of the designer's preview, as its viewport menu names them. */
export const Viewport = {
  desktop: "Desktop",
  desktopHalf: "Desktop 50/50",
  phone: "Phone",
  tablet: "Tablet",
  fullScreen: "Full screen",
} as const;

export type DesignerViewport = (typeof Viewport)[keyof typeof Viewport];

/** Store the page designer edits pages of. */
export interface PageDesignerOptions {
  readonly storeId: string;
}

/**
 * Page designer of the admin UI (the `pageDesigner` fixture): toolbar, section list, side panels and the live
 * preview, which is the frontend's `/designer-preview` page in an iframe. Start with {@link open}. Console errors
 * and page errors of the designer are collected from construction on, see {@link consoleErrors}.
 */
export class PageDesigner {
  readonly page: Page;
  /** Viewport menu trigger, named after the current viewport. */
  readonly viewportButton: Locator;
  readonly previewButton: Locator;
  readonly publishButton: Locator;
  readonly unpublishButton: Locator;
  readonly saveButton: Locator;
  readonly settingsButton: Locator;
  readonly pageHeaderButton: Locator;
  readonly addBlockButton: Locator;
  readonly sections: SectionList;
  readonly library: BlockLibrary;
  readonly sectionEditor: DesignerPanel;
  readonly settingsPanel: DesignerPanel;
  readonly pageHeaderPanel: DesignerPanel;
  /** Toast messages, such as "Section duplicated". */
  readonly notifications: Locator;
  readonly previewFrame: Locator;
  readonly preview: FrameLocator;
  /** The page's sections as the preview renders them, in order; each element's `id` is the section id. */
  readonly previewSections: Locator;
  /** The page header (H1) as the preview renders it. */
  readonly previewHeading: Locator;
  readonly previewBreadcrumbs: Locator;
  readonly #options: PageDesignerOptions;
  readonly #errors: string[] = [];

  constructor(page: Page, options: PageDesignerOptions) {
    this.page = page;
    this.#options = options;
    page.on("console", (message) => {
      if (message.type() === "error") {
        this.#errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      this.#errors.push(error.message);
    });
    this.viewportButton = page.getByRole("button", { name: new RegExp(`^(${Object.values(Viewport).join("|")})$`) });
    this.previewButton = page.getByRole("button", { name: "Preview", exact: true });
    this.publishButton = page.getByRole("button", { name: "Publish", exact: true });
    this.unpublishButton = page.getByRole("button", { name: "Unpublish", exact: true });
    this.saveButton = page.getByRole("button", { name: "Save", exact: true });
    this.settingsButton = page.getByRole("button", { name: "Settings", exact: true });
    this.pageHeaderButton = page.getByRole("button", { name: "Page Header", exact: true });
    this.addBlockButton = page.getByRole("button", { name: "Add block", exact: true });
    this.sections = new SectionList(page.getByRole("group", { name: "Page sections" }));
    this.library = new BlockLibrary(page.getByRole("region", { name: "Add block" }));
    this.sectionEditor = new DesignerPanel(page.getByRole("region", { name: "Edit current section" }));
    this.settingsPanel = new DesignerPanel(page.getByRole("region", { name: "Edit Settings" }));
    this.pageHeaderPanel = new DesignerPanel(page.getByRole("region", { name: "Edit Page Header" }));
    this.notifications = page.getByRole("alert");
    this.previewFrame = page.locator("iframe#preview-frame-component");
    this.preview = this.previewFrame.contentFrame();
    this.previewSections = this.preview.locator("#main-content [id][type]:not([type='scroll-to']):not([type] [type])");
    this.previewHeading = this.preview.locator("#main-content").getByRole("heading", { level: 1 });
    this.previewBreadcrumbs = this.preview.getByRole("navigation", { name: "Breadcrumbs navigation" });
  }

  /**
   * Loads the designer fresh for a page in a language and waits for its section list; the preview loads after it.
   * Opening again reloads the app, so it shows what the platform has saved.
   */
  async open(pageId: string, cultureName: string): Promise<void> {
    const store = encodeURIComponent(this.#options.storeId);
    const route = new URLSearchParams({ type: "pages", groupId: pageId, cultureName });
    await this.page.goto(`${DESIGNER_PATH}?storeId=${store}&reload=${Date.now()}#/pages?${route}`);
    await this.sections.root.waitFor({ state: "visible" });
  }

  /** Switches the preview to a viewport from the viewport menu. */
  async chooseViewport(viewport: DesignerViewport): Promise<void> {
    await this.viewportButton.click();
    await this.page.getByRole("menuitem", { name: viewport, exact: true }).click();
  }

  /** Width of the preview iframe in CSS pixels. */
  async previewWidth(): Promise<number> {
    const box = await this.previewFrame.boundingBox();
    if (box === null) {
      throw new Error("The designer's preview is not visible");
    }
    return box.width;
  }

  /** Section ids in the order the preview renders them. */
  async previewSectionIds(): Promise<string[]> {
    return this.previewSections.evaluateAll((sections) => sections.map((section) => section.id));
  }

  /** Saves the page's content and waits for the platform's answer. */
  async save(): Promise<void> {
    await whenResponse(this.page, isDesignerSave, () => this.saveButton.click());
  }

  /** Publishes the page and waits for the platform's answer. */
  async publish(): Promise<void> {
    await whenResponse(this.page, isPagePublishing, () => this.publishButton.click());
  }

  /** Clicks Preview and returns the frontend tab it opens, loaded. */
  async openPreviewTab(): Promise<Page> {
    const [tab] = await Promise.all([this.page.context().waitForEvent("page"), this.previewButton.click()]);
    await tab.waitForLoadState("domcontentloaded");
    return tab;
  }

  /** Console errors and uncaught page errors of the designer so far. */
  consoleErrors(): readonly string[] {
    return [...this.#errors];
  }
}
