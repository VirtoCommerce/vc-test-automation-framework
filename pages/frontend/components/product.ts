import type { Locator, Page } from "@playwright/test";
import type { Env } from "@core/env";
import type { QuantityControlKind } from "./controls";

import { exactText, startsWithText } from "../../selectors";
import { QuantityControl } from "./controls";

/** How the frontend renders range filters: a slider with inputs, or checkboxes of price ranges. */
export type RangeFilterKind = Env["rangeFilterType"];

const PRICE_FACET_ID = /^filter-price-[[(](\d+(?:\.\d+)?) TO (\d+(?:\.\d+)?)[\])]$/;

/** Every product card or line item inside `scope`, matched by `data-product-sku`. */
export function productItems(scope: Locator): Locator {
  return scope.locator("[data-product-sku]");
}

/** Product card or line item inside `scope` whose `data-product-sku` equals `sku`. */
export function productItem(scope: Locator, sku: string): Locator {
  return scope.locator(`[data-product-sku='${sku}']`);
}

/** Line item of the cart, a list or saved-for-later; its add-to-cart input applies a quantity on blur. */
export class LineItem {
  readonly root: Locator;
  readonly quantity: QuantityControl;
  readonly removeButton: Locator;
  readonly saveForLaterButton: Locator;
  /** Shown on configured line items only. */
  readonly editConfigurationLink: Locator;
  readonly #componentsToggle: Locator;
  readonly #collapsedComponents: Locator;

  constructor(root: Locator, kind: QuantityControlKind) {
    this.root = root;
    this.quantity = new QuantityControl(root, kind, "blur");
    this.removeButton = root.locator("[data-test-id='remove-item-button']");
    this.saveForLaterButton = root.locator(
      "[data-test-id='cart-item-actions-after-title'] [data-test-id='save-for-later-button']",
    );
    this.editConfigurationLink = root.locator(".configuration-items__edit");
    this.#componentsToggle = root.locator("button.configuration-items__toggle");
    this.#collapsedComponents = root.locator(".configuration-items--collapsed");
  }

  /** Expands the component list if collapsed; configured line items only, since it waits for the toggle. */
  async expandComponents(): Promise<void> {
    await this.#componentsToggle.waitFor();
    if ((await this.#collapsedComponents.count()) > 0) {
      await this.#componentsToggle.click();
      await this.#collapsedComponents.waitFor({ state: "detached" });
    }
  }
}

/**
 * Product card on a category page, in grid or list view; get one with `CategoryPage.scrollToProduct`.
 * Its add-to-cart input applies a quantity by clicking the button.
 */
export class ProductCard {
  readonly root: Locator;
  readonly quantity: QuantityControl;
  readonly addToListButton: Locator;
  /** Link to configure a configurable product; prefer {@link openConfigurations}. */
  readonly configurationsButton: Locator;
  /** Expands the variations of a product with variations. */
  readonly variationsButton: Locator;
  readonly #kind: QuantityControlKind;

  constructor(root: Locator, sku: string, kind: QuantityControlKind) {
    this.root = root;
    this.#kind = kind;
    this.quantity = new QuantityControl(root, kind, "click");
    this.addToListButton = root.locator("[data-test-id='add-to-list-button']");
    this.configurationsButton = root.locator("[data-test-id='product-card-configurations-button']");
    this.variationsButton = root.locator(`[data-test-id='variations-${sku}-button']`).first();
  }

  /** Quantity control of a variation; click {@link variationsButton} first to show the variations. */
  variation(sku: string): QuantityControl {
    return new QuantityControl(this.root.locator(`[data-item-sku='${sku}']`), this.#kind, "click");
  }

  /**
   * Clicks the configure link, following it into a new tab when the link targets `_blank`.
   * @returns The page showing the product: the new tab, or the current page. Build page objects on it.
   */
  async openConfigurations(): Promise<Page> {
    const page = this.root.page();
    if ((await this.configurationsButton.getAttribute("target")) !== "_blank") {
      await this.configurationsButton.click();
      return page;
    }
    const [tab] = await Promise.all([page.waitForEvent("popup"), this.configurationsButton.click()]);
    return tab;
  }
}

/** Option of a product configuration section. */
export class ProductConfigurationOption {
  readonly root: Locator;
  readonly radio: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.radio = root.locator("input[type='radio']");
  }
}

/** Product configuration section, such as Memory. */
export class ProductConfigurationSection {
  readonly root: Locator;
  /** Section subtitle showing the selected option. */
  readonly selectedOptionLabel: Locator;
  readonly requiredMark: Locator;
  readonly #header: Locator;
  readonly #options: Locator;

  constructor(root: Locator) {
    this.root = root;
    this.selectedOptionLabel = root.locator("[data-test-id='section-subtitle']");
    this.requiredMark = root.locator(".product-configuration__required");
    this.#header = root.locator(".vc-widget__header-container");
    this.#options = root.locator("[data-test-id='product-option']");
  }

  /** @param name - Option's product name, matched exactly. */
  option(name: string): ProductConfigurationOption {
    return new ProductConfigurationOption(
      this.#options.filter({ has: this.root.page().locator("a", { hasText: exactText(name) }) }),
    );
  }

  /**
   * Expands the section if collapsed and clicks the option's radio; does not wait for the price to update.
   * @param name - Option's product name, matched exactly.
   */
  async select(name: string): Promise<ProductConfigurationOption> {
    if (await this.root.evaluate((element) => element.classList.contains("vc-widget--collapsed"))) {
      await this.#header.click();
    }
    const option = this.option(name);
    await option.root.locator(".vc-radio-button__container").click();
    return option;
  }
}

/** Configuration area of a configurable product page. */
export class ProductConfiguration {
  readonly root: Locator;

  constructor(root: Locator) {
    this.root = root;
  }

  /** @param name - Section title start, such as `Memory` (matches `Memory *`). */
  section(name: string): ProductConfigurationSection {
    return new ProductConfigurationSection(
      this.root.locator("[data-test-id='section']").filter({
        has: this.root.page().locator("[data-test-id='section-title']", { hasText: startsWithText(name) }),
      }),
    );
  }
}

/** Category price filter, for either configured range filter kind; use {@link apply} rather than its inputs. */
export class PriceFilter {
  readonly root: Locator;
  /** Filter body; hidden while the filter is collapsed. */
  readonly content: Locator;
  readonly #kind: RangeFilterKind;
  readonly #header: Locator;

  constructor(root: Locator, kind: RangeFilterKind) {
    this.root = root;
    this.#kind = kind;
    this.#header = root.locator(".vc-widget__header-container");
    this.content = root.locator(".vc-widget__slot-container");
  }

  /**
   * Filters by a price range, expanding the filter if collapsed: the slider gets both inputs typed and blurred;
   * checkboxes get every range lying fully within `from`..`to` ticked. Does not wait for the product list to reload.
   */
  async apply(from: number, to: number): Promise<void> {
    if (!(await this.content.isVisible())) {
      await this.#header.click();
    }
    if (this.#kind === "slider") {
      await this.root.locator("[data-test-id='slider-input-start']").fill(String(from));
      await this.root.locator("[data-test-id='slider-input-end']").fill(String(to));
      await this.root.locator("[data-test-id='slider-input-end']").blur();
      return;
    }
    const facets = this.root.locator("[data-test-id^='filter-price-']");
    for (const id of await facets.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-test-id")))) {
      const bounds = PRICE_FACET_ID.exec(id ?? "");
      if (bounds !== null && Number(bounds[1]) >= from && Number(bounds[2]) <= to) {
        await this.root.locator(`[data-test-id='${id}']`).click();
      }
    }
  }
}
