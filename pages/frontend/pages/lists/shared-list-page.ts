import type { Locator, Page } from "@playwright/test";

import { productItems } from "../../components/catalog/product-items";
import { MainLayout } from "../../layouts/main-layout";

/** List opened by its share link, possibly by another user or anonymously. */
export class SharedListPage extends MainLayout {
  readonly path: string;
  readonly listTitle: Locator;
  readonly lineItems: Locator;
  readonly addToCartControls: Locator;
  /** "404" heading shown when the link is invalid or the list is no longer shared. */
  readonly notFound: Locator;

  /** @param sharingKey - Key from the share link (the list's sharing setting id). */
  constructor(page: Page, sharingKey: string) {
    super(page);
    this.path = `/shared-list/${sharingKey}`;
    this.listTitle = page.locator(".shared-list__name");
    this.lineItems = productItems(this.root);
    this.addToCartControls = page.getByTestId("add-to-cart-component");
    this.notFound = page.getByRole("heading", { name: "404" });
  }
}
