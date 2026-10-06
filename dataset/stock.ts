import type { InventoryInfo } from "@api/rest/types/inventory";
import type { Dataset } from "./dataset";

import { INVENTORY_INFO_FIELDS } from "@api/rest/types/inventory";
import { requireEach, requireFields } from "@core/required-fields";

export interface StockCondition {
  readonly stocks?: readonly string[];
  readonly lacks?: readonly string[];
}

export function getProductStock(dataset: Dataset, productId: string): InventoryInfo[] {
  return inventoriesOf(dataset, productId).filter((inventory) => inventory.inStockQuantity > 0);
}

export function getStockQuantity(dataset: Dataset, productId: string, fulfillmentCenterId: string): number {
  const inventory = inventoriesOf(dataset, productId).find((item) => item.fulfillmentCenterId === fulfillmentCenterId);
  return requireFields(inventory, ["inStockQuantity"], `Inventory of "${productId}" at "${fulfillmentCenterId}"`)
    .inStockQuantity;
}

export function findFulfillmentCenter(dataset: Dataset, condition: StockCondition, index = 0): string {
  const matching = requireEach(dataset.fulfillmentCenters, ["id"], "Dataset fulfillment center")
    .map(({ id }) => id)
    .filter(
      (centerId) =>
        (condition.stocks ?? []).every((productId) => isStockedAt(dataset, productId, centerId)) &&
        (condition.lacks ?? []).every((productId) => !isStockedAt(dataset, productId, centerId)),
    );
  const centerId = matching[index];
  if (centerId === undefined) {
    throw new Error(
      `Dataset has ${matching.length} fulfillment center(s) matching ${JSON.stringify(condition)}, need #${index + 1}`,
    );
  }
  return centerId;
}

function inventoriesOf(dataset: Dataset, productId: string): InventoryInfo[] {
  return requireEach(
    dataset.productInventories.filter((item) => item.productId === productId),
    INVENTORY_INFO_FIELDS,
    `Dataset inventory of "${productId}"`,
  );
}

function isStockedAt(dataset: Dataset, productId: string, fulfillmentCenterId: string): boolean {
  return getProductStock(dataset, productId).some((item) => item.fulfillmentCenterId === fulfillmentCenterId);
}
