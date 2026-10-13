import type { Dataset } from "./dataset";

/** The collections stock is read from; the whole {@link Dataset} fits. */
export type StockData = Pick<Dataset, "fulfillmentCenters" | "productInventories">;

/** Which products a fulfillment center must stock, and which it must not. */
export interface StockCondition {
  readonly stocks?: readonly string[];
  readonly lacks?: readonly string[];
}

/** Returns the dataset's stock of a product at a fulfillment center; 0 when there is no inventory record. */
export function stockQuantity(dataset: StockData, productId: string, fulfillmentCenterId: string): number {
  const inventory = dataset.productInventories
    .all()
    .find((item) => item.productId === productId && item.fulfillmentCenterId === fulfillmentCenterId);
  return inventory?.inStockQuantity ?? 0;
}

/** Returns the ids of the fulfillment centers with a positive stock of a product, in dataset order. */
export function centersStocking(dataset: StockData, productId: string): string[] {
  return dataset.fulfillmentCenters
    .all()
    .flatMap(({ id }) => (id !== undefined && id !== null && stockQuantity(dataset, productId, id) > 0 ? [id] : []));
}

/**
 * Finds the id of a fulfillment center by what it stocks and lacks, for pickup locations with a known availability.
 *
 * @example
 * findFulfillmentCenter(dataset, { stocks: [memory.id], lacks: [phone.id] });
 *
 * @param index - Which match to take, in dataset order; the first by default.
 * @throws Error naming the condition when fewer centers match than `index` needs.
 */
export function findFulfillmentCenter(dataset: StockData, condition: StockCondition, index = 0): string {
  const matching = dataset.fulfillmentCenters.all().flatMap(({ id }) => {
    if (id === undefined || id === null) {
      return [];
    }
    const stocksAll = (condition.stocks ?? []).every((productId) => stockQuantity(dataset, productId, id) > 0);
    const lacksAll = (condition.lacks ?? []).every((productId) => stockQuantity(dataset, productId, id) === 0);
    return stocksAll && lacksAll ? [id] : [];
  });
  const centerId = matching[index];
  if (centerId === undefined) {
    throw new Error(
      `Dataset has ${matching.length} fulfillment center(s) matching ${JSON.stringify(condition)}, need #${index + 1}`,
    );
  }
  return centerId;
}
