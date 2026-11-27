import type { Locator } from "@playwright/test";

/** Every product card or line item inside `scope`, matched by `data-product-sku`. */
export function productItems(scope: Locator): Locator {
  return scope.locator("[data-product-sku]");
}

/** Product card or line item inside `scope` whose `data-product-sku` equals `sku`. */
export function productItem(scope: Locator, sku: string): Locator {
  return scope.locator(`[data-product-sku='${sku}']`);
}
