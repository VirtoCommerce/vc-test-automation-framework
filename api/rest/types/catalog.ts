import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type CatalogData = Rest.VirtoCommerceCatalogModuleCoreModelCatalog;
export type CatalogLanguage = Rest.VirtoCommerceCatalogModuleCoreModelCatalogLanguage;
export type CatalogProductData = Rest.VirtoCommerceCatalogModuleCoreModelCatalogProduct;
export type CatalogSearchCriteria = Rest.VirtoCommerceCatalogModuleCoreModelSearchCatalogSearchCriteria;
export type CatalogSearchResult = Rest.VirtoCommerceCatalogModuleCoreModelSearchCatalogSearchResult;
export type CategoryData = Rest.VirtoCommerceCatalogModuleCoreModelCategory;
export type ListEntriesMoveRequest = Rest.VirtoCommerceCatalogModuleCoreModelListEntriesMoveRequest;
export type ListEntryData = Rest.VirtoCommerceCatalogModuleCoreModelListEntryListEntryBase;
export type ListEntrySearchCriteria = Rest.VirtoCommerceCatalogModuleCoreModelSearchCatalogListEntrySearchCriteria;
export type ListEntrySearchResult = Rest.VirtoCommerceCatalogModuleCoreModelSearchListEntrySearchResult;
export type ProductImage = Rest.VirtoCommerceCatalogModuleCoreModelImage;

export const CATALOG = shape<CatalogData>()("Catalog", ["id", "name"]);
export type Catalog = Shaped<typeof CATALOG>;
export const CATEGORY = shape<CategoryData>()("Category", ["id", "code", "name", "catalogId"]);
export type Category = Shaped<typeof CATEGORY>;
export const CATALOG_PRODUCT = shape<CatalogProductData>()("Catalog product", ["id", "code", "name", "catalogId"]);
export type CatalogProduct = Shaped<typeof CATALOG_PRODUCT>;
export const LIST_ENTRY = shape<ListEntryData>()("List entry", ["id", "name"]);
export type ListEntry = Shaped<typeof LIST_ENTRY>;
