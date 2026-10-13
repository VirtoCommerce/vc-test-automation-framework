import type { Locator, Page } from "@playwright/test";
import type { QuantityControlKind } from "../components/controls";
import type { RangeFilterKind } from "../components/product";

import { expect } from "@playwright/test";

import { PriceFilter, ProductCard, ProductConfiguration, productItem, productItems } from "../components/product";
import { FrontendPage } from "./layout";

const FIRST_CARDS_TIMEOUT_MS = 60_000;
const SCROLL_TIMEOUT_MS = 30_000;
const SCROLL_STEP_PX = 2_000;

/** Category page with an infinitely loading product list; use {@link scrollToProduct} to get a card. */
export class CategoryPage extends FrontendPage {
  readonly path: string;
  readonly productsCountLabel: Locator;
  readonly gridViewTab: Locator;
  readonly listViewTab: Locator;
  readonly gridView: Locator;
  readonly listView: Locator;
  readonly priceFilter: PriceFilter;
  /** Cards loaded so far, in whichever view is active. */
  readonly productCards: Locator;
  readonly #quantityControl: QuantityControlKind;

  /**
   * @param categoryPath - Category path, such as `smartphones`.
   * @param sort - `sort` query value; ascending price by default.
   */
  constructor(
    page: Page,
    categoryPath: string,
    kinds: { readonly quantityControl: QuantityControlKind; readonly rangeFilterType: RangeFilterKind },
    sort = "price-ascending",
  ) {
    super(page);
    this.path = `/${categoryPath}?sort=${sort}`;
    this.#quantityControl = kinds.quantityControl;
    this.productsCountLabel = page.locator("[data-test-id='products-count-label']");
    this.gridViewTab = page.locator("[data-test-id='view-switcher'] [data-test-id='grid-view-tab']");
    this.listViewTab = page.locator("[data-test-id='view-switcher'] [data-test-id='list-view-tab']");
    this.gridView = page.locator("[data-test-id='products-grid-view']");
    this.listView = page.locator("[data-test-id='products-list-view']");
    this.priceFilter = new PriceFilter(page.locator("[data-test-id='filter-price']"), kinds.rangeFilterType);
    this.productCards = productItems(this.gridView.or(this.listView));
  }

  /**
   * Scrolls the list until the product's card loads and scrolls it into view. Waits up to 60 s for the first cards,
   * then scrolls for up to 30 s; fails if the product never appears. Call after {@link navigate}.
   */
  async scrollToProduct(sku: string): Promise<ProductCard> {
    const card = productItem(this.gridView.or(this.listView), sku);
    await this.productCards.first().waitFor({ timeout: FIRST_CARDS_TIMEOUT_MS });
    await expect
      .poll(
        async () => {
          if ((await card.count()) > 0) {
            return true;
          }
          await this.productCards.last().scrollIntoViewIfNeeded();
          await this.page.mouse.wheel(0, SCROLL_STEP_PX);
          return false;
        },
        { message: `${sku} is on category page ${this.path}`, timeout: SCROLL_TIMEOUT_MS },
      )
      .toBe(true);
    await card.scrollIntoViewIfNeeded();
    return new ProductCard(card, sku, this.#quantityControl);
  }
}

/** Product page; {@link configuration} is for configurable products. */
export class ProductPage extends FrontendPage {
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
    this.addToListButton = this.root.locator("[data-test-id='add-to-list-button']");
    this.configuration = new ProductConfiguration(this.root.locator(".product-configuration"));
    this.totalPrice = this.root.locator(".product-price__value .price__value");
    this.addToCartButton = this.root.locator(".product-price__actions button[title='Add to cart']");
    this.updateCartButton = this.root.locator(".product-price__actions button[title='Update cart']");
  }
}
