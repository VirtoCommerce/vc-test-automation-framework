import type { CatalogData, CatalogProductData, CategoryData } from "@api/rest/types/catalog";
import type { WithRequired } from "@core/required-fields";

import { randomUUID } from "node:crypto";

import { uniqueId } from "@core/unique-id";

/**
 * Builds a physical catalog named `test-catalog-…` with one language.
 *
 * @param languageCode - The default and only language, such as `en-US`.
 */
export function newCatalog(languageCode: string): WithRequired<CatalogData, "id" | "name"> {
  const language = { languageCode, isDefault: true };
  return {
    id: randomUUID(),
    name: uniqueId("test-catalog"),
    isVirtual: false,
    defaultLanguage: language,
    languages: [language],
  };
}

/** Builds an active category whose code and name are one unique `test-category-…` value. */
export function newCategory(catalogId: string): CategoryData {
  const code = uniqueId("test-category");
  return { catalogId, name: code, code, isActive: true };
}

/**
 * Builds a physical product whose code and name are one unique `test-product-…` value.
 *
 * @param overrides - Fields that differ, such as `trackInventory`.
 */
export function newProduct(
  catalogId: string,
  categoryId: string,
  overrides: Partial<CatalogProductData> = {},
): CatalogProductData {
  const code = uniqueId("test-product");
  return { catalogId, categoryId, name: code, code, productType: "Physical", ...overrides };
}
