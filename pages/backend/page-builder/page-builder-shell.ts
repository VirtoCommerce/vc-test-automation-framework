import type { Locator, Page } from "@playwright/test";
import type { PageBuilderRoute } from "./routes";

import { whenResponse } from "../../responses";
import { AppMenu, UserInfo } from "../vc-shell/app-shell";
import { blades } from "../vc-shell/blade";
import { searchInputIn } from "../vc-shell/data-grid";
import { Notifications } from "../vc-shell/feedback";
import { PageDetailsBlade } from "./page-details-blade";
import { PagesListBlade } from "./pages-list-blade";
import { isPagesSearch } from "./requests";
import { Route } from "./routes";

/** Side menu item id of each list route, for {@link AppMenu.counter}. */
const MenuItem: Readonly<Record<PageBuilderRoute, string>> = {
  [Route.all]: "AllPagesList",
  [Route.draft]: "DraftPagesList",
  [Route.pending]: "PendingPagesList",
  [Route.active]: "ActivePagesList",
  [Route.archived]: "ArchivedPagesList",
};

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
    const all = blades(page);
    this.listBlade = new PagesListBlade(all.filter({ has: searchInputIn(page) }));
    this.detailsBlade = new PageDetailsBlade(all.filter({ has: page.getByTestId("permalink-prefix") }));
    const user = new UserInfo(page);
    this.logo = user.logo;
    this.userName = user.name;
    this.userRole = user.role;
  }

  /**
   * Loads the app fresh at a list route and waits for its page search response and the list blade.
   * @param route - All pages by default.
   */
  async open(route: PageBuilderRoute = Route.all): Promise<void> {
    const path = this.#options.path.endsWith("/") ? this.#options.path : `${this.#options.path}/`;
    const url = `${path}?storeId=${encodeURIComponent(this.#options.storeId)}&reload=${Date.now()}#/${route}`;
    await whenResponse(
      this.page,
      (response) => isPagesSearch(response),
      () => this.page.goto(url),
    );
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
