import type { PromotionsClient } from "@api/rest/clients/promotions-client";
import type { CleanupStack } from "@core/cleanup-stack";

export function registerPromotionCouponsRemoval(
  promotionsClient: PromotionsClient,
  cleanupStack: CleanupStack,
  promotionId: string,
): void {
  cleanupStack.push(`delete the coupons of promotion ${promotionId}`, async () => {
    const coupons = await promotionsClient.searchCoupons({ promotionId });
    if (coupons.length > 0) {
      await promotionsClient.deleteCoupons(coupons.map(({ id }) => id));
    }
  });
}
