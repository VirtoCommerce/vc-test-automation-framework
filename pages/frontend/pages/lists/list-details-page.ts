import type { Locator, Page } from "@playwright/test";

import { productItems } from "../../components/catalog/product-items";
import { MainLayout } from "../../layouts/main-layout";

/** Details page of one of the account's lists. */
export class ListDetailsPage extends MainLayout {
  readonly path: string;
  readonly lineItems: Locator;
  readonly addAllToCartButton: Locator;

  constructor(page: Page, listId: string) {
    super(page);
    this.path = `/account/lists/${listId}`;
    this.lineItems = productItems(this.root);
    this.addAllToCartButton = page.getByTestId("add-all-to-cart-button");
  }
}
