import type { WithRequired } from "@core/required-fields";
import type {
  VirtoCommerceCoreModuleCoreConditionsIConditionTree as ConditionTree,
  VirtoCommerceMarketingModuleCoreModelPromotionsCoupon as CouponData,
  VirtoCommerceMarketingModuleCoreModelPromotionsSearchCouponSearchCriteria as CouponSearchCriteria,
  VirtoCommerceMarketingModuleCoreModelPromotionsSearchCouponSearchResult as CouponSearchResult,
  VirtoCommerceMarketingModuleCoreModelDynamicContentDynamicContentConditionTree as DynamicContentConditionTree,
  VirtoCommerceMarketingModuleCoreModelDynamicContentFolder as DynamicContentFolderData,
  VirtoCommerceMarketingModuleCoreModelDynamicContentItem as DynamicContentItemData,
  VirtoCommerceMarketingModuleCoreModelDynamicContentItemSearchCriteria as DynamicContentItemSearchCriteria,
  VirtoCommerceMarketingModuleCoreModelDynamicContentPlace as DynamicContentPlaceData,
  VirtoCommerceMarketingModuleCoreModelDynamicContentPlaceSearchCriteria as DynamicContentPlaceSearchCriteria,
  VirtoCommerceMarketingModuleCoreModelDynamicContentPublication as DynamicContentPublicationData,
  VirtoCommerceMarketingModuleCoreModelDynamicContentPublicationSearchCriteria as DynamicContentPublicationSearchCriteria,
  VirtoCommerceMarketingModuleCoreModelPromotionsPromotion as PromotionData,
  VirtoCommerceMarketingModuleCoreModelPromotionsSearchPromotionSearchCriteria as PromotionSearchCriteria,
  VirtoCommerceMarketingModuleCoreModelPromotionsSearchPromotionSearchResult as PromotionSearchResult,
} from "../generated/rest-api";

export type {
  ConditionTree,
  CouponData,
  CouponSearchCriteria,
  CouponSearchResult,
  DynamicContentConditionTree,
  DynamicContentFolderData,
  DynamicContentItemData,
  DynamicContentItemSearchCriteria,
  DynamicContentPlaceData,
  DynamicContentPlaceSearchCriteria,
  DynamicContentPublicationData,
  DynamicContentPublicationSearchCriteria,
  PromotionData,
  PromotionSearchCriteria,
  PromotionSearchResult,
};

export const PROMOTION_FIELDS = ["id", "name"] as const;
export const COUPON_FIELDS = ["id", "code", "promotionId"] as const;

export type Promotion = WithRequired<PromotionData, (typeof PROMOTION_FIELDS)[number]>;
export type Coupon = WithRequired<CouponData, (typeof COUPON_FIELDS)[number]>;

export const NAMED_ENTITY_FIELDS = ["id", "name"] as const;

export interface NamedEntityData {
  id?: string | null;
  name?: string | null;
}

export type NamedEntity<Data extends NamedEntityData> = WithRequired<Data, (typeof NAMED_ENTITY_FIELDS)[number]>;
