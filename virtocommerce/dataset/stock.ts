import { dataset } from "./index.ts";

/** Products that a fulfillment center must stock or lack, for {@link findFulfillmentCenter}. */
interface StockCondition {
  readonly stocks?: readonly string[];
  readonly lacks?: readonly string[];
}

/**
 * Returns the stock of a product in a fulfillment center of the dataset.
 *
 * @param productId - The identifier of the product.
 * @param fulfillmentCenterId - The identifier of the fulfillment center.
 * @returns The quantity in stock, 0 when the center has no inventory of the product.
 */
export function stockQuantity(productId: string, fulfillmentCenterId: string): number {
  const inventory = dataset.productInventories
    .all()
    .find((item) => item.productId === productId && item.fulfillmentCenterId === fulfillmentCenterId);
  return inventory?.inStockQuantity ?? 0;
}

/**
 * Returns the fulfillment centers of the dataset that stock a product.
 *
 * @param productId - The identifier of the product.
 * @returns The identifiers of the centers.
 */
export function centersStocking(productId: string): string[] {
  return fulfillmentCenterIds().filter((id) => stockQuantity(productId, id) > 0);
}

/**
 * Returns a fulfillment center of the dataset that stocks and lacks the given products.
 *
 * @param condition - The products the center must stock and lack.
 * @param index - Which of the matching centers, the first by default.
 * @returns The identifier of the center.
 * @throws {Error} Fewer centers match.
 */
export function findFulfillmentCenter(condition: StockCondition, index = 0): string {
  const matching = fulfillmentCenterIds().filter(
    (id) =>
      (condition.stocks ?? []).every((productId) => stockQuantity(productId, id) > 0) &&
      (condition.lacks ?? []).every((productId) => stockQuantity(productId, id) === 0),
  );
  const centerId = matching[index];
  if (centerId === undefined) {
    throw new Error(
      `The dataset has ${matching.length} fulfillment center(s) matching ${JSON.stringify(condition)}, ` +
        `not #${index + 1}`,
    );
  }
  return centerId;
}

function fulfillmentCenterIds(): string[] {
  return dataset.fulfillmentCenters.all().flatMap(({ id }) => (typeof id === "string" ? [id] : []));
}
