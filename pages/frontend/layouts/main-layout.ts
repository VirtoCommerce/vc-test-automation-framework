import type { Locator, Page } from "@playwright/test";

import { TopHeader } from "../components/top-header";
import { Layout } from "./layout";

export abstract class MainLayout extends Layout {
  readonly root: Locator;
  readonly topHeader: TopHeader;
  readonly cartQuantityLabel: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.locator(".main-layout");
    this.topHeader = new TopHeader(page.locator("[data-test-id='top-header']"));
    this.cartQuantityLabel = page.locator("[data-test-id='desktop-main-menu-cart-link'] .vc-badge__content");
  }
}
