import type { Locator, Page, Response } from "@playwright/test";
import type { Card, DatePicker, Select } from "../shell/controls";

import { expect } from "@playwright/test";

import { AppMenu, Blade, ConfirmationPopup, DISABLED_TOOLBAR_BUTTON, GridRow, Notifications } from "../shell/controls";

/** Page list routes of the page builder shell, one per status; pass to {@link PageBuilderShell.open}. */
export const Route = {
  all: "page-builder",
  draft: "page-builder-draft",
  pending: "page-builder-pending",
  active: "page-builder-active",
  archived: "page-builder-archived",
} as const;

export type PageBuilderRoute = (typeof Route)[keyof typeof Route];

/** Side menu item id of each list route, for {@link AppMenu.counter}. */
const MenuItem: Readonly<Record<PageBuilderRoute, string>> = {
  [Route.all]: "AllPagesList",
  [Route.draft]: "DraftPagesList",
  [Route.pending]: "PendingPagesList",
  [Route.active]: "ActivePagesList",
  [Route.archived]: "ArchivedPagesList",
};

/** Column ids (`data-column-id`) of the page list grid. */
export const Column = {
  name: "name",
  language: "cultureName",
  permalink: "permalink",
  modified: "modifiedDate",
  modifiedBy: "modifiedBy",
  status: "status",
} as const;

/** Toolbar item ids of the page details blade; archive's id is `delete`. */
export const DetailsToolbar = {
  save: "save",
  archive: "delete",
  openDesigner: "openPageDesigner",
  publish: "publishPage",
  unpublish: "unpublishPage",
} as const;

const SEARCH_PATH = "/api/page-builder-pages/search";
const SAVE_PATH = "/api/page-builder-pages/grouped";
const PUBLISHING_PATH = "/api/page-builder-pages/grouped/publishing/";
const ROWS_TIMEOUT_MS = 10_000;

/**
 * Whether a response answers the page search (`POST /api/page-builder-pages/search`).
 * @param keyword - Required search keyword (`""` matches a search without one); omit to match any search.
 */
function isPagesSearch(response: Response, keyword?: string): boolean {
  if (response.request().method() !== "POST" || new URL(response.url()).pathname !== SEARCH_PATH) {
    return false;
  }
  const criteria: unknown = response.request().postDataJSON();
  const searched = typeof criteria === "object" && criteria !== null ? Reflect.get(criteria, "keyword") : undefined;
  return keyword === undefined || (searched ?? "") === keyword;
}

/** Blade listing pages, with a search box. */
export class PagesListBlade extends Blade {
  readonly searchInput: Locator;

  constructor(root: Locator) {
    super(root);
    this.searchInput = root.locator(".vc-input input[placeholder='Search...']");
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
    const [response] = await Promise.all([
      this.root.page().waitForResponse((candidate) => isPagesSearch(candidate, term)),
      this.searchInput.fill(term),
    ]);
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

/** Text fields for {@link PageDetailsBlade.fill}; omitted fields are left untouched. */
export interface PageFields {
  readonly name?: string;
  readonly permalink?: string;
}

/**
 * Blade that shows and edits one page. Expand {@link personalizationSection} or {@link schedulingSection} before
 * using their fields. Field setters do not save; call {@link save}.
 */
export class PageDetailsBlade extends Blade {
  readonly personalizationSection: Card;
  readonly schedulingSection: Card;
  readonly nameInput: Locator;
  readonly permalinkInput: Locator;
  /** Frontend URL shown before the permalink input. */
  readonly permalinkPrefix: Locator;
  readonly language: Select;
  readonly userGroups: Select;
  readonly organization: Select;
  /** Visibility switch input; read its checked state, change it with {@link setVisibility}. */
  readonly visibilityToggle: Locator;
  readonly startDate: DatePicker;
  readonly endDate: DatePicker;
  readonly saveButton: Locator;
  readonly #visibilityControl: Locator;

  constructor(root: Locator) {
    super(root);
    this.personalizationSection = this.card("Personalization & Access control");
    this.schedulingSection = this.card("Scheduling");
    this.nameInput = this.textInput("Name*");
    this.permalinkInput = this.textInput("Permalink*");
    this.permalinkPrefix = this.field("Permalink*").locator("[data-test-id='permalink-prefix']");
    this.language = this.select("Language");
    this.userGroups = this.select("User groups");
    this.organization = this.select("Organization");
    this.visibilityToggle = root.locator("input[role='switch']").first();
    this.#visibilityControl = root.locator(".vc-switch").first();
    this.startDate = this.datePicker("Start date");
    this.endDate = this.datePicker("End date");
    this.saveButton = this.toolbarButton(DetailsToolbar.save);
  }

  /** Types the given name and permalink; does not save. */
  async fill(fields: PageFields): Promise<void> {
    if (fields.name !== undefined) {
      await this.nameInput.fill(fields.name);
    }
    if (fields.permalink !== undefined) {
      await this.permalinkInput.fill(fields.permalink);
    }
  }

  /** Toggles the visibility switch only if it differs from `visible`; does not save. */
  async setVisibility(visible: boolean): Promise<void> {
    if ((await this.visibilityToggle.isChecked()) !== visible) {
      await this.#visibilityControl.click();
    }
  }

  /** Clicks save and waits for the save response (POST/PUT), whatever its status; assert the outcome after. */
  async save(): Promise<void> {
    await Promise.all([
      this.root
        .page()
        .waitForResponse(
          (response) =>
            ["POST", "PUT"].includes(response.request().method()) &&
            new URL(response.url()).pathname.startsWith(SAVE_PATH),
        ),
      this.saveButton.click(),
    ]);
  }

  /** Waits for the publish button to be enabled, clicks it and waits for a successful publishing response. */
  async publish(): Promise<void> {
    await this.#changeStatus(DetailsToolbar.publish);
  }

  /** Waits for the unpublish button to be enabled, clicks it and waits for a successful publishing response. */
  async unpublish(): Promise<void> {
    await this.#changeStatus(DetailsToolbar.unpublish);
  }

  async #changeStatus(itemId: string): Promise<void> {
    const button = this.toolbarButton(itemId);
    await expect(button).not.toHaveClass(DISABLED_TOOLBAR_BUTTON);
    await Promise.all([
      this.root
        .page()
        .waitForResponse((response) => new URL(response.url()).pathname.startsWith(PUBLISHING_PATH) && response.ok()),
      button.click(),
    ]);
  }

  /** Clicks archive and confirms the popup; waits for the popup to close, not for a response. */
  async archive(): Promise<void> {
    await this.toolbarButton(DetailsToolbar.archive).click();
    await new ConfirmationPopup(this.root.page()).confirm();
  }
}

/** Location of the page builder shell app. */
export interface PageBuilderShellOptions {
  /** App path on the platform, such as `/apps/page-builder-shell/`. */
  readonly path: string;
  /** Store whose pages the app shows. */
  readonly storeId: string;
}

/**
 * Page builder shell of the admin UI (the `pageBuilder` fixture): side menu, page list blade, details blade and
 * signed-in user. Start with {@link open}; navigation methods reload the app so lists are fresh.
 *
 * @example
 * const details = await pageBuilder.openPage(name, Route.draft);
 * await details.publish();
 * expect(await pageBuilder.isListed(Route.active, name)).toBe(true);
 */
export class PageBuilderShell {
  readonly page: Page;
  readonly menu: AppMenu;
  readonly notifications: Notifications;
  readonly listBlade: PagesListBlade;
  readonly detailsBlade: PageDetailsBlade;
  readonly logo: Locator;
  readonly userName: Locator;
  readonly userRole: Locator;
  readonly #options: PageBuilderShellOptions;

  constructor(page: Page, options: PageBuilderShellOptions) {
    this.page = page;
    this.#options = options;
    this.menu = new AppMenu(page);
    this.notifications = new Notifications(page);
    const blades = page.locator(".vc-blade");
    this.listBlade = new PagesListBlade(
      blades.filter({ has: page.locator(".vc-input input[placeholder='Search...']") }),
    );
    this.detailsBlade = new PageDetailsBlade(blades.filter({ has: page.locator("[data-test-id='permalink-prefix']") }));
    this.logo = page.locator(".sidebar-header__logo-image");
    this.userName = page.locator(".vc-user-info__name");
    this.userRole = page.locator(".vc-user-info__role");
  }

  /**
   * Loads the app fresh at a list route and waits for its page search response and the list blade.
   * @param route - All pages by default.
   */
  async open(route: PageBuilderRoute = Route.all): Promise<void> {
    const path = this.#options.path.endsWith("/") ? this.#options.path : `${this.#options.path}/`;
    const url = `${path}?storeId=${encodeURIComponent(this.#options.storeId)}&reload=${Date.now()}#/${route}`;
    await Promise.all([this.page.waitForResponse((response) => isPagesSearch(response)), this.page.goto(url)]);
    await this.listBlade.root.waitFor({ state: "visible" });
  }

  /**
   * Opens a page's details blade from the list, searching for it if needed; waits for the name input. The name must
   * be unique in the list.
   * @param route - List to load first; omit to stay on the current list.
   */
  async openPage(name: string, route?: PageBuilderRoute): Promise<PageDetailsBlade> {
    if (route !== undefined) {
      await this.open(route);
    }
    await this.listBlade.reveal(name);
    await this.listBlade.pageRows(name).click();
    await this.detailsBlade.nameInput.waitFor({ state: "visible" });
    return this.detailsBlade;
  }

  /** Loads the draft list, clicks add and returns the empty details blade of a new, unsaved page. */
  async addPage(): Promise<PageDetailsBlade> {
    await this.open(Route.draft);
    await this.listBlade.toolbarButton("add").click();
    await this.detailsBlade.nameInput.waitFor({ state: "visible" });
    return this.detailsBlade;
  }

  /** Reloads the app at a list and tells whether a page of that name is in it, searching if needed. */
  async isListed(route: PageBuilderRoute, name: string): Promise<boolean> {
    await this.open(route);
    return this.listBlade.reveal(name);
  }

  /**
   * Reloads the app at a list and reads its counts, to check the menu badge against the grid.
   * @returns `counter`: the menu badge (`undefined` when none); `listed`: the grid's total row count.
   */
  async counts(route: PageBuilderRoute): Promise<{ readonly counter: number | undefined; readonly listed: number }> {
    await this.open(route);
    return { counter: await this.menu.counter(MenuItem[route]), listed: await this.listBlade.grid.totalCount() };
  }
}
