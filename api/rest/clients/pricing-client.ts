import type { HttpClient } from "../../http/http-client";
import type {
  Price,
  Pricelist,
  PricelistAssignment,
  PricelistAssignmentData,
  PricelistAssignmentQuery,
  PricelistAssignmentSearchResult,
  PricelistData,
  PricelistQuery,
  PricesSearchCriteria,
  ProductPriceData,
  ProductPriceSearchResult,
} from "../types/pricing";

import { requireFields, requireFieldsOfEach } from "@core/required-fields";

import { PRICE, PRICELIST, PRICELIST_ASSIGNMENT, PRODUCT_PRICE } from "../types/pricing";

const PRICING_PATH = "/api/pricing";
const PRICELISTS_PATH = `${PRICING_PATH}/pricelists`;
const ASSIGNMENTS_PATH = `${PRICING_PATH}/assignments`;
const FILTERED_ASSIGNMENTS_PATH = `${PRICING_PATH}/filteredAssignments`;
const PRICES_PATH = `${PRICING_PATH}/products/prices`;
const PRODUCT_PRICING_PATH = "/api/products";
const PRODUCT_PRICES_PATH = `${PRODUCT_PRICING_PATH}/prices`;
const PRICES_SEARCH_PATH = "/api/catalog/products/prices/search";

class PricelistsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async get(id: string): Promise<Pricelist> {
    return requireFields(await this.find(id), PRICELIST.fields, `Pricelist "${id}"`);
  }

  async find(id: string): Promise<Pricelist | undefined> {
    const response = await this.#httpClient.get(`${PRICELISTS_PATH}/${encodeURIComponent(id)}`);
    return response.optionalRecord(PRICELIST);
  }

  async create(pricelist: PricelistData): Promise<Pricelist> {
    const response = await this.#httpClient.post(PRICELISTS_PATH, { json: pricelist });
    return response.record(PRICELIST);
  }

  async update(pricelist: PricelistData): Promise<void> {
    (await this.#httpClient.put(PRICELISTS_PATH, { json: pricelist })).expectOk();
  }

  async search(query: PricelistQuery): Promise<Pricelist[]> {
    return (await this.#httpClient.get(PRICELISTS_PATH, { query })).results(PRICELIST);
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(PRICELISTS_PATH, { query: { ids } })).expectOk();
  }
}

class PricesResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async saveMany(productPrices: readonly ProductPriceData[]): Promise<void> {
    (await this.#httpClient.put(PRODUCT_PRICES_PATH, { json: productPrices })).expectOk();
  }

  async saveForProduct(productPrice: ProductPriceData & { productId: string }): Promise<void> {
    const path = `${PRODUCT_PRICING_PATH}/${encodeURIComponent(productPrice.productId)}/prices`;
    (await this.#httpClient.put(path, { json: productPrice })).expectOk();
  }

  async search(criteria: PricesSearchCriteria): Promise<Price[]> {
    const response = await this.#httpClient.post(PRICES_SEARCH_PATH, { json: criteria });
    return pricesOf(response.json<ProductPriceSearchResult>());
  }

  async listOfPricelist(pricelistId: string): Promise<Price[]> {
    const response = await this.#httpClient.get(PRICES_SEARCH_PATH, { query: { PriceListId: pricelistId } });
    return pricesOf(response.json<ProductPriceSearchResult>());
  }

  async listOfProduct(productId: string, catalogId: string): Promise<Price[]> {
    const path = `${PRODUCT_PRICING_PATH}/${encodeURIComponent(productId)}/${encodeURIComponent(catalogId)}/pricesWidget`;
    const response = await this.#httpClient.get(path);
    return response.records(PRICE);
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(PRICES_PATH, { query: { priceIds: ids } })).expectOk();
  }

  async deleteOfProducts(pricelistId: string, productIds: readonly string[]): Promise<void> {
    const path = `${PRICELISTS_PATH}/${encodeURIComponent(pricelistId)}/products/prices`;
    (await this.#httpClient.delete(path, { query: { productIds } })).expectOk();
  }
}

class AssignmentsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async get(id: string): Promise<PricelistAssignment> {
    return requireFields(await this.find(id), PRICELIST_ASSIGNMENT.fields, `Assignment "${id}"`);
  }

  async find(id: string): Promise<PricelistAssignment | undefined> {
    const response = await this.#httpClient.get(`${ASSIGNMENTS_PATH}/${encodeURIComponent(id)}`);
    return response.optionalRecord(PRICELIST_ASSIGNMENT);
  }

  async template(): Promise<PricelistAssignmentData> {
    return (await this.#httpClient.get(`${ASSIGNMENTS_PATH}/new`)).json<PricelistAssignmentData>();
  }

  async create(assignment: PricelistAssignmentData): Promise<PricelistAssignment> {
    const response = await this.#httpClient.post(ASSIGNMENTS_PATH, { json: assignment });
    return response.record(PRICELIST_ASSIGNMENT);
  }

  async update(assignment: PricelistAssignmentData): Promise<void> {
    (await this.#httpClient.put(ASSIGNMENTS_PATH, { json: assignment })).expectOk();
  }

  async search(query: PricelistAssignmentQuery): Promise<PricelistAssignment[]> {
    const { results } = (
      await this.#httpClient.get(ASSIGNMENTS_PATH, { query })
    ).json<PricelistAssignmentSearchResult>();
    return requireFieldsOfEach(results, PRICELIST_ASSIGNMENT.fields, "Found assignment");
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(ASSIGNMENTS_PATH, { query: { ids } })).expectOk();
  }

  /**
   * Deletes every assignment matching the filter. The keyword is required, because an unfiltered call deletes all
   * assignments on the platform.
   *
   * @throws Error when the keyword is empty.
   */
  async deleteMatching(query: PricelistAssignmentQuery & { readonly keyword: string }): Promise<void> {
    if (query.keyword.trim() === "") {
      throw new Error("Deleting assignments by filter needs a non-empty keyword");
    }
    (await this.#httpClient.delete(FILTERED_ASSIGNMENTS_PATH, { query })).expectOk();
  }
}

export class PricingClient {
  readonly pricelists: PricelistsResource;
  readonly prices: PricesResource;
  readonly assignments: AssignmentsResource;

  constructor(httpClient: HttpClient) {
    this.pricelists = new PricelistsResource(httpClient);
    this.prices = new PricesResource(httpClient);
    this.assignments = new AssignmentsResource(httpClient);
  }
}

function pricesOf({ results }: ProductPriceSearchResult): Price[] {
  const prices = requireFieldsOfEach(results, PRODUCT_PRICE.fields, "Found product price").flatMap(
    ({ prices }) => prices,
  );
  return requireFieldsOfEach(prices, PRICE.fields, "Found price");
}
