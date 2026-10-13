import type { ApiSession } from "@api/api-session";
import type { Coupon, NamedEntity, NamedEntityData, Promotion } from "@api/rest/types/marketing";
import type { CleanupStack } from "@core/cleanup-stack";
import type { CouponLimits, DynamicContentKind } from "../builders/marketing";
import type { ArrangeContext } from "./context";

import { newCoupon, newDynamicContent, newPromotion } from "../builders/marketing";

/** Arranges promotions, coupons and marketing dynamic content. */
export class MarketingArrange {
  readonly #admin: ApiSession;
  readonly #cleanup: CleanupStack;

  constructor({ admin, cleanup }: ArrangeContext) {
    this.#admin = admin;
    this.#cleanup = cleanup;
  }

  /** Creates an inactive promotion and deletes it after the test. */
  async promotion(): Promise<Promotion> {
    const { promotions } = this.#admin.rest;
    const draft = newPromotion();
    this.#cleanup.push(`delete promotion ${draft.name}`, () => promotions.delete([draft.id]));
    return promotions.create(draft);
  }

  /**
   * Creates a coupon for a promotion and deletes it after the test.
   *
   * @param limits - How often the coupon may be used.
   * @returns The coupon as the platform stores it.
   */
  async coupon(promotionId: string, limits: CouponLimits): Promise<Coupon> {
    const { coupons } = this.#admin.rest.promotions;
    const draft = newCoupon(promotionId, limits);
    await coupons.saveMany([draft]);
    const coupon = await coupons.getByCode(promotionId, draft.code);
    this.#cleanup.push(`delete coupon ${coupon.code}`, () => coupons.delete([coupon.id]));
    return coupon;
  }

  /**
   * Creates a uniquely named marketing dynamic content record and deletes it after the test.
   * Publications are created inactive.
   *
   * @param kind - `folders`, `items`, `places` or `publications`.
   */
  async dynamicContent(kind: DynamicContentKind): Promise<NamedEntity<NamedEntityData>> {
    const resource = this.#admin.rest.dynamicContent[kind];
    const draft = newDynamicContent(kind);
    this.#cleanup.push(`delete dynamic content ${draft.name}`, () => resource.delete([draft.id]));
    return resource.create(draft);
  }
}
