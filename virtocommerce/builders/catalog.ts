import type {
  VirtoCommerceCatalogModuleCoreModelCatalog as Catalog,
  VirtoCommerceCatalogModuleCoreModelCatalogProduct as CatalogProduct,
  VirtoCommerceCatalogModuleCoreModelCategory as Category,
} from "../rest/generated/platform.ts";

import { randomUUID } from "node:crypto";

import { uniqueId } from "../support/unique-id.ts";

/**
 * Returns a new physical catalog with one language.
 *
 * @param languageCode - The default language of the catalog.
 * @returns The catalog, with a unique name.
 */
export function newCatalog(languageCode: string): Catalog & { readonly id: string; readonly name: string } {
  const language = { languageCode, isDefault: true };
  return {
    id: randomUUID(),
    name: uniqueId("test-catalog"),
    isVirtual: false,
    defaultLanguage: language,
    languages: [language],
  };
}

/**
 * Returns a new active top-level category.
 *
 * @param catalogId - The catalog of the category.
 * @returns The category, with a unique name and code.
 */
export function newCategory(catalogId: string): Category {
  const code = uniqueId("test-category");
  return { catalogId, name: code, code, isActive: true };
}

/**
 * Returns a new physical product.
 *
 * @param catalogId - The catalog of the product.
 * @param categoryId - The category of the product.
 * @param overrides - Fields to change, such as `trackInventory`.
 * @returns The product, with a unique name and code.
 */
export function newProduct(
  catalogId: string,
  categoryId: string,
  overrides: Partial<CatalogProduct> = {},
): CatalogProduct {
  const code = uniqueId("test-product");
  return { catalogId, categoryId, name: code, code, productType: "Physical", ...overrides };
}
