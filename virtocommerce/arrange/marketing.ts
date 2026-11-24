import type { DynamicContentDraft, DynamicContentKind, PromotionDraft } from "../builders/marketing.ts";
import type { ArrangeContext } from "./context.ts";

import { newDynamicContent, newPromotion } from "../builders/marketing.ts";

/** Arranges promotions, coupons and dynamic content. */
export interface MarketingArrange {
  /** Creates an inactive promotion and deletes it after the test. */
  promotion(): Promise<PromotionDraft>;
  /** Creates a dynamic content record of a kind, such as an inactive publication, and deletes it after the test. */
  dynamicContent(kind: DynamicContentKind): Promise<DynamicContentDraft>;
  /** Deletes a promotion after the test, such as one that the code under test creates. */
  deletePromotionLater(promotionId: string): void;
  /** Deletes a coupon after the test, such as one that the code under test creates. */
  deleteCouponLater(couponId: string): void;
  /** Deletes a dynamic content record after the test, such as one that the code under test creates. */
  deleteDynamicContentLater(kind: DynamicContentKind, id: string): void;
}

const PROMOTIONS_PATH = "/api/marketing/promotions";

const DYNAMIC_CONTENT_PATHS: Readonly<Record<DynamicContentKind, string>> = {
  folders: "/api/marketing/contentfolders",
  items: "/api/marketing/contentitems",
  places: "/api/marketing/contentplaces",
  publications: "/api/marketing/contentpublications",
};

/**
 * Returns the marketing methods of `arrange`.
 *
 * @param context - What the methods create and remove data with.
 * @returns The methods.
 */
export function marketingArrange({ admin, later }: ArrangeContext): MarketingArrange {
  async function promotion(): Promise<PromotionDraft> {
    const draft = newPromotion();
    (await (await admin()).post(PROMOTIONS_PATH, { json: draft })).expectOk();
    deletePromotionLater(draft.id);
    return draft;
  }

  async function dynamicContent(kind: DynamicContentKind): Promise<DynamicContentDraft> {
    const draft = newDynamicContent(kind);
    (await (await admin()).post(DYNAMIC_CONTENT_PATHS[kind], { json: draft })).expectOk();
    deleteDynamicContentLater(kind, draft.id);
    return draft;
  }

  function deletePromotionLater(promotionId: string): void {
    later(`delete promotion ${promotionId}`, async () =>
      (await (await admin()).delete(PROMOTIONS_PATH, { query: { ids: [promotionId] } })).expectOk(),
    );
  }

  function deleteCouponLater(couponId: string): void {
    later(`delete coupon ${couponId}`, async () =>
      (await (await admin()).delete(`${PROMOTIONS_PATH}/coupons/delete`, { query: { ids: [couponId] } })).expectOk(),
    );
  }

  function deleteDynamicContentLater(kind: DynamicContentKind, id: string): void {
    later(`delete dynamic content ${kind} ${id}`, async () =>
      (await (await admin()).delete(DYNAMIC_CONTENT_PATHS[kind], { query: { ids: [id] } })).expectOk(),
    );
  }

  return { promotion, dynamicContent, deletePromotionLater, deleteCouponLater, deleteDynamicContentLater };
}
