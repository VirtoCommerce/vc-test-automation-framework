import type { Shaped } from "@core/record-shape";
import type { WithRequired } from "@core/required-fields";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type ConditionTree = Rest.VirtoCommerceCoreModuleCoreConditionsIConditionTree;
export type CouponData = Rest.VirtoCommerceMarketingModuleCoreModelPromotionsCoupon;
export type CouponSearchCriteria = Rest.VirtoCommerceMarketingModuleCoreModelPromotionsSearchCouponSearchCriteria;
export type CouponSearchResult = Rest.VirtoCommerceMarketingModuleCoreModelPromotionsSearchCouponSearchResult;
export type DynamicContentConditionTree =
  Rest.VirtoCommerceMarketingModuleCoreModelDynamicContentDynamicContentConditionTree;
export type DynamicContentFolderData = Rest.VirtoCommerceMarketingModuleCoreModelDynamicContentFolder;
export type DynamicContentItemData = Rest.VirtoCommerceMarketingModuleCoreModelDynamicContentItem;
export type DynamicContentItemSearchCriteria =
  Rest.VirtoCommerceMarketingModuleCoreModelDynamicContentItemSearchCriteria;
export type DynamicContentPlaceData = Rest.VirtoCommerceMarketingModuleCoreModelDynamicContentPlace;
export type DynamicContentPlaceSearchCriteria =
  Rest.VirtoCommerceMarketingModuleCoreModelDynamicContentPlaceSearchCriteria;
export type DynamicContentPublicationData = Rest.VirtoCommerceMarketingModuleCoreModelDynamicContentPublication;
export type DynamicContentPublicationSearchCriteria =
  Rest.VirtoCommerceMarketingModuleCoreModelDynamicContentPublicationSearchCriteria;
export type PromotionData = Rest.VirtoCommerceMarketingModuleCoreModelPromotionsPromotion;
export type PromotionSearchCriteria = Rest.VirtoCommerceMarketingModuleCoreModelPromotionsSearchPromotionSearchCriteria;
export type PromotionSearchResult = Rest.VirtoCommerceMarketingModuleCoreModelPromotionsSearchPromotionSearchResult;

export const PROMOTION = shape<PromotionData>()("Promotion", ["id", "name"]);
export type Promotion = Shaped<typeof PROMOTION>;
export const COUPON = shape<CouponData>()("Coupon", ["id", "code", "promotionId"]);
export type Coupon = Shaped<typeof COUPON>;

export interface NamedEntityData {
  id?: string | null;
  name?: string | null;
}

export const NAMED_ENTITY = shape<NamedEntityData>()("Named entity", ["id", "name"]);
export type NamedEntity<Data extends NamedEntityData> = WithRequired<Data, (typeof NAMED_ENTITY.fields)[number]>;
