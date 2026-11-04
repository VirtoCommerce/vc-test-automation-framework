import type { Locator, Page } from "@playwright/test";
import type { RangeFilterKind } from "../../components/catalog/price-filter";
import type { QuantityControlKind } from "../../ui-kit/quantity-control";

import { expect } from "@playwright/test";

import { PriceFilter } from "../../components/catalog/price-filter";
import { ProductCard } from "../../components/catalog/product-card";
import { productItem, productItems } from "../../components/catalog/product-items";
import { MainLayout } from "../../layouts/main-layout";

const FIRST_CARDS_TIMEOUT_MS = 60_000;
const SCROLL_TIMEOUT_MS = 30_000;
const SCROLL_STEP_PX = 2_000;

/** Category page with an infinitely loading product list; use {@link scrollToProduct} to get a card. */
export class CategoryPage extends MainLayout {
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
    this.productsCountLabel = page.getByTestId("products-count-label");
    this.gridViewTab = page.getByTestId("view-switcher").getByTestId("grid-view-tab");
    this.listViewTab = page.getByTestId("view-switcher").getByTestId("list-view-tab");
    this.gridView = page.getByTestId("products-grid-view");
    this.listView = page.getByTestId("products-list-view");
    this.priceFilter = new PriceFilter(page.getByTestId("filter-price"), kinds.rangeFilterType);
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
