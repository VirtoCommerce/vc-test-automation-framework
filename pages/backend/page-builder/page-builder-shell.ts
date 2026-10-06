import type { Locator, Page, Response } from "@playwright/test";
import type { PageBuilderRoute } from "./constants";
import type { PageFields } from "./page-details-blade";

import { expect } from "@playwright/test";

import { AppMenu, ConfirmationPopup, Notifications } from "../shell/controls";
import { MenuItem, Route } from "./constants";
import { PageDetailsBlade } from "./page-details-blade";
import { isPagesSearch, PagesListBlade } from "./pages-list-blade";

const LIST_REFRESH_TIMEOUT_MS = 45_000;
const LIST_REFRESH_INTERVALS_MS = [2_000];
const SAVE_PAGE_PATH = "/api/page-builder-pages/grouped";
const RELOAD_PARAMETER = "reload";

const MENU_ITEM_FOR_ROUTE: Readonly<Record<PageBuilderRoute, string>> = {
  [Route.all]: MenuItem.all,
  [Route.draft]: MenuItem.draft,
  [Route.pending]: MenuItem.pending,
  [Route.active]: MenuItem.active,
  [Route.archived]: MenuItem.archived,
};

export interface PageBuilderShellOptions {
  readonly path: string;
  readonly storeId: string;
}

export class PageBuilderShell {
  readonly page: Page;
  readonly menu: AppMenu;
  readonly blades: Locator;
  readonly popup: ConfirmationPopup;
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
    this.blades = page.locator(".vc-blade");
    this.popup = new ConfirmationPopup(page);
    this.notifications = new Notifications(page);
    this.listBlade = new PagesListBlade(this.blades.filter({ has: page.locator(PagesListBlade.SEARCH_INPUT) }));
    this.detailsBlade = new PageDetailsBlade(
      this.blades.filter({ has: page.locator(PageDetailsBlade.PERMALINK_PREFIX) }),
    );
    this.logo = page.locator(".sidebar-header__logo-image");
    this.userName = page.locator(".vc-user-info__name");
    this.userRole = page.locator(".vc-user-info__role");
  }

  url(route: PageBuilderRoute = Route.all): string {
    const path = this.#options.path.endsWith("/") ? this.#options.path : `${this.#options.path}/`;
    return `${path}?storeId=${encodeURIComponent(this.#options.storeId)}#/${route}`;
  }

  async open(route: PageBuilderRoute = Route.all): Promise<void> {
    const url = this.url(route).replace("#", `&${RELOAD_PARAMETER}=${Date.now()}#`);
    await Promise.all([this.page.waitForResponse(isPagesSearch), this.page.goto(url)]);
    await this.listBlade.root.waitFor({ state: "visible" });
  }

  async openPage(name: string, route?: PageBuilderRoute): Promise<PageDetailsBlade> {
    if (route !== undefined) {
      await this.open(route);
    }
    await this.listBlade.openPage(name);
    await this.detailsBlade.nameInput.waitFor({ state: "visible" });
    return this.detailsBlade;
  }

  async createPage(fields: Required<PageFields>, language: string): Promise<Response> {
    await this.open(Route.draft);
    const details = await this.addPage();
    await details.fill(fields);
    await details.language.select(language);
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (candidate) => candidate.request().method() === "POST" && new URL(candidate.url()).pathname === SAVE_PAGE_PATH,
      ),
      details.saveButton.click(),
    ]);
    return response;
  }

  async saveDetails(): Promise<void> {
    await this.detailsBlade.saveButton.click();
    await expect(this.notifications.success.first()).toBeVisible();
  }

  async addPage(): Promise<PageDetailsBlade> {
    await this.listBlade.add();
    await this.detailsBlade.nameInput.waitFor({ state: "visible" });
    return this.detailsBlade;
  }

  async expectListed(route: PageBuilderRoute, name: string, listed = true): Promise<PagesListBlade> {
    await expect
      .poll(
        async () => {
          await this.open(route);
          return this.listBlade.reveal(name);
        },
        {
          message: `${name} is ${listed ? "" : "not "}listed under ${route}`,
          timeout: LIST_REFRESH_TIMEOUT_MS,
          intervals: LIST_REFRESH_INTERVALS_MS,
        },
      )
      .toBe(listed);
    return this.listBlade;
  }

  async expectCounterMatchesList(route: PageBuilderRoute): Promise<void> {
    const menuItem = MENU_ITEM_FOR_ROUTE[route];
    await expect
      .poll(
        async () => {
          await this.open(route);
          const listed = await this.listBlade.grid.totalCount();
          const counter = await this.menu.counter(menuItem);
          return counter === (listed === 0 ? undefined : listed) ? "match" : `counter ${counter}, listed ${listed}`;
        },
        {
          message: `the ${menuItem} menu counter matches the number of listed pages`,
          timeout: LIST_REFRESH_TIMEOUT_MS,
          intervals: LIST_REFRESH_INTERVALS_MS,
        },
      )
      .toBe("match");
  }
}
