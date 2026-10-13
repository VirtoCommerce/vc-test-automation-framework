import type { WithRequired } from "@core/required-fields";
import type {
  VirtoCommercePricingModuleCoreModelPrice as PriceData,
  VirtoCommercePricingModuleCoreModelPricelistAssignment as PricelistAssignmentData,
  VirtoCommercePricingModuleCoreModelSearchPricelistAssignmentSearchResult as PricelistAssignmentSearchResult,
  VirtoCommercePricingModuleCoreModelPricelist as PricelistData,
  VirtoCommercePricingModuleCoreModelSearchPricelistSearchResult as PricelistSearchResult,
  VirtoCommercePricingModuleCoreModelSearchPricesSearchCriteria as PricesSearchCriteria,
  VirtoCommercePricingModuleCoreModelProductPrice as ProductPriceData,
  VirtoCommercePricingModuleCoreModelSearchProductPriceSearchResult as ProductPriceSearchResult,
} from "../generated/rest-api";

export type {
  PriceData,
  PricelistAssignmentData,
  PricelistAssignmentSearchResult,
  PricelistData,
  PricelistSearchResult,
  PricesSearchCriteria,
  ProductPriceData,
  ProductPriceSearchResult,
};

export const PRODUCT_PRICE_FIELDS = ["productId", "prices"] as const;
export const PRICELIST_FIELDS = ["id", "name", "currency"] as const;
export const PRICE_FIELDS = ["id", "pricelistId", "productId", "list", "currency"] as const;
export const PRICELIST_ASSIGNMENT_FIELDS = ["id", "name", "pricelistId"] as const;

export type Pricelist = WithRequired<PricelistData, (typeof PRICELIST_FIELDS)[number]>;
export type Price = WithRequired<PriceData, (typeof PRICE_FIELDS)[number]>;
export type PricelistAssignment = WithRequired<PricelistAssignmentData, (typeof PRICELIST_ASSIGNMENT_FIELDS)[number]>;

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
