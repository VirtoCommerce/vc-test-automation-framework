import type {
  VirtoCommercePricingModuleCoreModelPrice as Price,
  VirtoCommercePricingModuleCoreModelSearchProductPriceSearchResult as ProductPriceSearchResult,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newProductPrice } from "@builders/pricing.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

const DATASET_PRODUCT_ID = "product-laptop-acer-predator-helios-neo-16-ai";
const PRICES_SEARCH_PATH = "/api/catalog/products/prices/search";

test.describe("prices (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("list the prices of a pricelist", async ({ api, arrange }) => {
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    await test.step("arrange: the product priced at 15", () => arrange.pricing.price(pricelist, product.id, 15));

    const prices = await test.step("act: list the pricelist's prices", async () =>
      pricesOf(await api.get(PRICES_SEARCH_PATH, { query: { PriceListId: pricelist.id } })));

    await test.step("assert: exactly the product's price is listed", () => {
      expect(prices).toEqual([expect.objectContaining({ productId: product.id, list: 15 })]);
    });
  });

  test("replace a price through the product", async ({ api, arrange }) => {
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    await test.step("arrange: the product priced at 10", () => arrange.pricing.price(pricelist, product.id, 10));

    await test.step("act: save the product's price as 25", async () =>
      (
        await api.put(`/api/products/${product.id}/prices`, { json: newProductPrice(pricelist, product.id, 25) })
      ).expectOk());

    await test.step("assert: the pricelist has only the new price", async () => {
      expect(await searchPrices(api, { priceListIds: [pricelist.id] })).toEqual([
        expect.objectContaining({ productId: product.id, list: 25 }),
      ]);
    });
  });

  test("delete a price by id", async ({ api, arrange }) => {
    const product = await test.step("arrange: a product", () => arrange.catalog.catalogProduct());
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());
    await test.step("arrange: the product priced at 5", () => arrange.pricing.price(pricelist, product.id, 5));
    const prices = await test.step("arrange: the price, as search finds it", () =>
      searchPrices(api, { priceListIds: [pricelist.id] }));

    await test.step("act: delete the price by its id", async () =>
      (
        await api.delete("/api/pricing/products/prices", { query: { priceIds: prices.map(({ id }) => String(id)) } })
      ).expectOk());

    await test.step("assert: the pricelist has no prices", async () => {
      expect(await searchPrices(api, { priceListIds: [pricelist.id] })).toEqual([]);
    });
  });

  test("price products and delete their prices in bulk", async ({ api, arrange }) => {
    const productIds = await test.step("arrange: two products", async () => [
      (await arrange.catalog.catalogProduct()).id,
      (await arrange.catalog.catalogProduct()).id,
    ]);
    const pricelist = await test.step("arrange: a pricelist", () => arrange.pricing.pricelist());

    await test.step("act: price both products at 49.99 in one request", async () =>
      (
        await api.put("/api/products/prices", {
          json: productIds.map((productId) => newProductPrice(pricelist, productId, 49.99)),
        })
      ).expectOk());
    await test.step("assert: each product has exactly that price in the pricelist", async () => {
      const prices = await searchPrices(api, { priceListIds: [pricelist.id], productIds });
      expect(prices).toHaveLength(productIds.length);
      expect(prices).toEqual(
        expect.arrayContaining(
          productIds.map((productId) => expect.objectContaining({ pricelistId: pricelist.id, productId, list: 49.99 })),
        ),
      );
    });

    await test.step("act: delete the prices of both products in one request", async () =>
      (
        await api.delete(`/api/pricing/pricelists/${pricelist.id}/products/prices`, { query: { productIds } })
      ).expectOk());
    await test.step("assert: the pricelist has no prices", async () => {
      expect(await searchPrices(api, { priceListIds: [pricelist.id] })).toEqual([]);
    });
  });

  test("get the prices of a dataset product", async ({ api, dataset, store }) => {
    const expected = dataset.prices
      .filter(({ productId }) => productId === DATASET_PRODUCT_ID)
      .flatMap(({ prices }) => prices ?? [])
      .map(({ pricelistId, currency, list, minQuantity }) => ({ pricelistId, currency, list, minQuantity }));

    const prices = await test.step(`act: get the prices of ${DATASET_PRODUCT_ID}`, async () =>
      (await api.get(`/api/products/${DATASET_PRODUCT_ID}/${store.catalog}/pricesWidget`)).expectOk().json<Price[]>());

    await test.step("assert: the prices are exactly the dataset's", () => {
      expect(prices).toHaveLength(expected.length);
      expect(prices).toEqual(expect.arrayContaining(expected.map((price) => expect.objectContaining(price))));
    });
  });
});

async function searchPrices(
  api: HttpClient,
  criteria: { readonly priceListIds: readonly string[]; readonly productIds?: readonly string[] },
): Promise<Price[]> {
  return pricesOf(await api.post(PRICES_SEARCH_PATH, { json: criteria }));
}

function pricesOf(response: Awaited<ReturnType<HttpClient["get"]>>): Price[] {
  const { results } = response.expectOk().json<ProductPriceSearchResult>();
  return (results ?? []).flatMap(({ prices }) => prices ?? []);
}
