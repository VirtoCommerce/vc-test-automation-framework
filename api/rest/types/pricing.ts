import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type PriceData = Rest.VirtoCommercePricingModuleCoreModelPrice;
export type PricelistAssignmentData = Rest.VirtoCommercePricingModuleCoreModelPricelistAssignment;
export type PricelistAssignmentSearchResult =
  Rest.VirtoCommercePricingModuleCoreModelSearchPricelistAssignmentSearchResult;
export type PricelistData = Rest.VirtoCommercePricingModuleCoreModelPricelist;
export type PricelistSearchResult = Rest.VirtoCommercePricingModuleCoreModelSearchPricelistSearchResult;
export type PricesSearchCriteria = Rest.VirtoCommercePricingModuleCoreModelSearchPricesSearchCriteria;
export type ProductPriceData = Rest.VirtoCommercePricingModuleCoreModelProductPrice;
export type ProductPriceSearchResult = Rest.VirtoCommercePricingModuleCoreModelSearchProductPriceSearchResult;

export const PRODUCT_PRICE = shape<ProductPriceData>()("Product price", ["productId", "prices"]);
export const PRICELIST = shape<PricelistData>()("Pricelist", ["id", "name", "currency"]);
export type Pricelist = Shaped<typeof PRICELIST>;
export const PRICE = shape<PriceData>()("Price", ["id", "pricelistId", "productId", "list", "currency"]);
export type Price = Shaped<typeof PRICE>;
export const PRICELIST_ASSIGNMENT = shape<PricelistAssignmentData>()("Pricelist assignment", [
  "id",
  "name",
  "pricelistId",
]);
export type PricelistAssignment = Shaped<typeof PRICELIST_ASSIGNMENT>;

export type PricelistQuery = {
  readonly keyword?: string;
  readonly objectIds?: readonly string[];
  readonly currencies?: readonly string[];
  readonly sort?: string;
  readonly skip?: number;
  readonly take?: number;
};

export type PricelistAssignmentQuery = {
  readonly keyword?: string;
  readonly objectIds?: readonly string[];
  readonly priceListId?: string;
  readonly priceListIds?: readonly string[];
  readonly catalogIds?: readonly string[];
  readonly storeIds?: readonly string[];
  readonly sort?: string;
  readonly skip?: number;
  readonly take?: number;
};
