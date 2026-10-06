import type { Locator, Page } from "@playwright/test";

import { expect } from "@playwright/test";

import { CategoryViewSwitcher } from "../components/category-view-switcher";
import { productItem, productItems } from "../components/line-item";
import { PriceFilter } from "../components/price-filter";
import { ProductCard } from "../components/product-card";
import { MainLayout } from "../layouts/main-layout";

const FIRST_CARDS_TIMEOUT_MS = 30_000;
const SCROLL_TIMEOUT_MS = 30_000;
const SCROLL_STEP_PX = 2_000;

export class CategoryPage extends MainLayout {
  readonly path: string;
  readonly productsCountLabel: Locator;
  readonly viewSwitcher: CategoryViewSwitcher;
  readonly gridView: Locator;
  readonly listView: Locator;
  readonly priceFilter: PriceFilter;
  readonly productCards: Locator;

  constructor(page: Page, categoryPath: string, sort = "price-ascending") {
    super(page);
    this.path = `/${categoryPath}?sort=${sort}`;
    this.productsCountLabel = page.locator("[data-test-id='products-count-label']");
    this.viewSwitcher = new CategoryViewSwitcher(page.locator("[data-test-id='view-switcher']"));
    this.gridView = page.locator("[data-test-id='products-grid-view']");
    this.listView = page.locator("[data-test-id='products-list-view']");
    this.priceFilter = new PriceFilter(page.locator("[data-test-id='filter-price']"));
    this.productCards = productItems(this.gridView.or(this.listView));
  }

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
    return new ProductCard(card, sku);
  }
}
