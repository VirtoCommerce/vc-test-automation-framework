import type { StockData } from "@dataset/stock";

import { expect, test } from "@playwright/test";

import { Collection } from "@dataset/collection";
import { centersStocking, findFulfillmentCenter, stockQuantity } from "@dataset/stock";

const STOCK: StockData = {
  fulfillmentCenters: new Collection("fulfillmentCenters", [
    { id: "center-a" },
    { id: "center-b" },
    { id: "center-c" },
  ]),
  productInventories: new Collection("productInventories", [
    { productId: "phone", fulfillmentCenterId: "center-a", inStockQuantity: 5 },
    { productId: "memory", fulfillmentCenterId: "center-a", inStockQuantity: 2 },
    { productId: "memory", fulfillmentCenterId: "center-b", inStockQuantity: 7 },
    { productId: "phone", fulfillmentCenterId: "center-b", inStockQuantity: 0 },
    { productId: "memory", fulfillmentCenterId: "center-c", inStockQuantity: 1 },
  ]),
};

test.describe("stockQuantity", () => {
  test("is the inventory's quantity, or 0 without an inventory record", () => {
    expect(stockQuantity(STOCK, "memory", "center-b")).toBe(7);
    expect(stockQuantity(STOCK, "phone", "center-c")).toBe(0);
  });
});

test.describe("centersStocking", () => {
  test("lists the centers with a positive stock, in dataset order", () => {
    expect(centersStocking(STOCK, "phone")).toEqual(["center-a"]);
    expect(centersStocking(STOCK, "memory")).toEqual(["center-a", "center-b", "center-c"]);
  });
});

test.describe("findFulfillmentCenter", () => {
  test("finds the center that stocks some products and lacks others", () => {
    expect(findFulfillmentCenter(STOCK, { stocks: ["memory"], lacks: ["phone"] })).toBe("center-b");
  });

  test("takes the matching center at the index", () => {
    expect(findFulfillmentCenter(STOCK, { stocks: ["memory"], lacks: ["phone"] }, 1)).toBe("center-c");
  });

  test("names the condition when too few centers match", () => {
    expect(() => findFulfillmentCenter(STOCK, { stocks: ["phone"] }, 1)).toThrow(
      'Dataset has 1 fulfillment center(s) matching {"stocks":["phone"]}, need #2',
    );
  });
});
