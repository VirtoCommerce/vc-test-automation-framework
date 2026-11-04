import type { Locator, Page } from "@playwright/test";

import { ProductConfiguration } from "../../components/catalog/product-configuration";
import { MainLayout } from "../../layouts/main-layout";

/** Product page; {@link configuration} is for configurable products. */
export class ProductPage extends MainLayout {
  readonly path: string;
  readonly addToListButton: Locator;
  readonly configuration: ProductConfiguration;
  readonly totalPrice: Locator;
  readonly addToCartButton: Locator;
  /** Shown instead of {@link addToCartButton} when editing a configured cart line item. */
  readonly updateCartButton: Locator;

  /** @param productPath - Product path, such as `laptops/acer-predator-helios-neo-16-ai`; a leading `/` is optional. */
  constructor(page: Page, productPath: string) {
    super(page);
    this.path = `/${productPath.replace(/^\//, "")}`;
    this.addToListButton = this.root.getByTestId("add-to-list-button");
    this.configuration = new ProductConfiguration(this.root.locator(".product-configuration"));
    this.totalPrice = this.root.locator(".product-price__value .price__value");
    this.addToCartButton = this.root.locator(".product-price__actions button[title='Add to cart']");
    this.updateCartButton = this.root.locator(".product-price__actions button[title='Update cart']");
  }
}
