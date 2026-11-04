import type { Page } from "@playwright/test";

import { MainLayout } from "../../layouts/main-layout";

/** Content page served at its permalink, such as a page published from the page builder. */
export class ContentPage extends MainLayout {
  readonly path: string;

  constructor(page: Page, permalink: string) {
    super(page);
    this.path = permalink;
  }
}
