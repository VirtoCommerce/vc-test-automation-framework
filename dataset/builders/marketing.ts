import type {
  ConditionTree,
  CouponData,
  DynamicContentConditionTree,
  DynamicContentPublicationData,
  NamedEntityData,
  PromotionData,
} from "@api/rest/types/marketing";
import type { WithRequired } from "@core/required-fields";

import { randomUUID } from "node:crypto";

import { uniqueId } from "@core/unique-id";

/** A promotion to create, with a unique name. */
export type PromotionDraft = WithRequired<PromotionData, "id" | "name">;

/** A coupon to create, with a unique code. */
export type CouponDraft = WithRequired<CouponData, "code" | "promotionId">;

/** How often a coupon may be used: in all, and by one user. */
export interface CouponLimits {
  readonly maxUsesNumber: number;
  readonly maxUsesPerUser: number;
}

interface BlockContentCondition extends ConditionTree {
  readonly all: boolean;
  readonly not: boolean;
}

interface AgeIsCondition extends ConditionTree {
  readonly compareCondition: "AtLeast";
  readonly value: number;
  readonly secondValue: number;
}

/** Builds an inactive promotion named `test-promotion-…`, so it never changes prices for other tests. */
export function newPromotion(): PromotionDraft {
  return { id: randomUUID(), name: uniqueId("test-promotion"), isActive: false };
}

/** Builds a coupon of a promotion with a unique upper-case `TEST-COUPON-…` code. */
export function newCoupon(promotionId: string, limits: CouponLimits): CouponDraft {
  return { promotionId, code: uniqueId("TEST-COUPON").toUpperCase(), ...limits };
}

/** Builds an inactive publication named `test-content-publication-…`, so other tests' shoppers never see it. */
export function newPublication(): WithRequired<DynamicContentPublicationData, "id" | "name"> {
  return { id: randomUUID(), name: uniqueId("test-content-publication"), isActive: false };
}

/** The kinds of marketing dynamic content, as `api.rest.dynamicContent` names them. */
export type DynamicContentKind = "folders" | "items" | "places" | "publications";

/** Builds a dynamic content record named `test-content-<kind>-…`; a publication comes from {@link newPublication}. */
export function newDynamicContent(kind: DynamicContentKind): WithRequired<NamedEntityData, "id" | "name"> {
  return kind === "publications" ? newPublication() : { id: randomUUID(), name: uniqueId(`test-content-${kind}`) };
}

/**
 * Builds a publication condition tree that shows it to shoppers aged `minimumAge` or more.
 * Shaped as the back office builds it: one block with one age condition.
 */
export function ageConditionTree(minimumAge: number): DynamicContentConditionTree {
  const ageIs: AgeIsCondition = {
    id: "ConditionAgeIs",
    compareCondition: "AtLeast",
    value: minimumAge,
    secondValue: 0,
    availableChildren: [],
    children: [],
  };
  const block: BlockContentCondition = {
    id: "BlockContentCondition",
    all: false,
    not: false,
    availableChildren: [],
    children: [ageIs],
  };
  return { id: "DynamicContentConditionTree", all: true, not: false, availableChildren: [], children: [block] };
}
