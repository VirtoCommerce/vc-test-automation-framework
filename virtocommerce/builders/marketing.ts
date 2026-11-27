import type {
  VirtoCommerceMarketingModuleCoreModelPromotionsCoupon as Coupon,
  VirtoCommerceMarketingModuleCoreModelDynamicContentDynamicContentConditionTree as DynamicContentConditionTree,
  VirtoCommerceMarketingModuleCoreModelPromotionsPromotion as Promotion,
} from "../rest/generated/platform.ts";

import { randomUUID } from "node:crypto";

import { uniqueId } from "../support/unique-id.ts";

/** A kind of dynamic content, named after its REST resource. */
export type DynamicContentKind = "folders" | "items" | "places" | "publications";

/** A dynamic content record to create, with its identifier and name. */
export interface DynamicContentDraft {
  readonly id: string;
  readonly name: string;
  readonly isActive?: boolean;
}

/** A promotion to create, with its identifier and name. */
export type PromotionDraft = Promotion & { readonly id: string; readonly name: string };

/** A coupon to create, with its code and promotion. */
type CouponDraft = Coupon & { readonly code: string; readonly promotionId: string };

/** How often a coupon may be used. */
interface CouponLimits {
  readonly maxUsesNumber: number;
  readonly maxUsesPerUser: number;
}

/**
 * Returns a new inactive promotion.
 *
 * @returns The promotion, with a unique name.
 */
export function newPromotion(): PromotionDraft {
  return { id: randomUUID(), name: uniqueId("test-promotion"), isActive: false };
}

/**
 * Returns a new coupon of a promotion.
 *
 * @param promotionId - The promotion of the coupon.
 * @param limits - How often the coupon may be used.
 * @returns The coupon, with a unique upper-case code.
 */
export function newCoupon(promotionId: string, limits: CouponLimits): CouponDraft {
  return { promotionId, code: uniqueId("TEST-COUPON").toUpperCase(), ...limits };
}

/**
 * Returns a new dynamic content record; a publication is inactive.
 *
 * @param kind - The kind of the record.
 * @returns The record, with a unique name.
 */
export function newDynamicContent(kind: DynamicContentKind): DynamicContentDraft {
  return kind === "publications"
    ? { id: randomUUID(), name: uniqueId("test-content-publication"), isActive: false }
    : { id: randomUUID(), name: uniqueId(`test-content-${kind}`) };
}

/**
 * Returns the condition of a content publication that shows it to shoppers of at least an age.
 *
 * @param minimumAge - The age.
 * @returns The condition tree.
 */
export function ageConditionTree(minimumAge: number): DynamicContentConditionTree {
  const ageIs = {
    id: "ConditionAgeIs",
    compareCondition: "AtLeast",
    value: minimumAge,
    secondValue: 0,
    availableChildren: [],
    children: [],
  };
  const block = { id: "BlockContentCondition", all: false, not: false, availableChildren: [], children: [ageIs] };
  return {
    id: "DynamicContentConditionTree",
    all: true,
    not: false,
    availableChildren: [],
    children: [block],
  } as DynamicContentConditionTree;
}
