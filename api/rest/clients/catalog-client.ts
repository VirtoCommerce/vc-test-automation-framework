import type { HttpClient } from "../../http/http-client";
import type {
  Catalog,
  CatalogData,
  CatalogProduct,
  CatalogProductData,
  CatalogSearchCriteria,
  CatalogSearchResult,
  Category,
  CategoryData,
  ListEntriesMoveRequest,
  ListEntry,
  ListEntrySearchCriteria,
  ListEntrySearchResult,
} from "../types/catalog";

import { optionalFields, requireFields, requireFieldsOfEach } from "@core/required-fields";

import { CATALOG_FIELDS, CATALOG_PRODUCT_FIELDS, CATEGORY_FIELDS, LIST_ENTRY_FIELDS } from "../types/catalog";

const CATALOG_PATH = "/api/catalog";
const CATALOGS_PATH = `${CATALOG_PATH}/catalogs`;
const CATEGORIES_PATH = `${CATALOG_PATH}/categories`;
const PRODUCTS_PATH = `${CATALOG_PATH}/products`;
const LIST_ENTRIES_PATH = `${CATALOG_PATH}/listentries`;

class CatalogsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async create(catalog: CatalogData): Promise<Catalog> {
    const response = await this.#httpClient.post(CATALOGS_PATH, { json: catalog });
    return requireFields(response.json<CatalogData>(), CATALOG_FIELDS, "Created catalog");
  }

  async update(catalog: CatalogData): Promise<void> {
    (await this.#httpClient.put(CATALOGS_PATH, { json: catalog })).expectOk();
  }

  async search(criteria: CatalogSearchCriteria): Promise<Catalog[]> {
    const response = await this.#httpClient.post(`${CATALOGS_PATH}/search`, { json: criteria });
    const { results } = response.json<CatalogSearchResult>();
    return requireFieldsOfEach(results, CATALOG_FIELDS, "Found catalog");
  }

  async delete(id: string): Promise<void> {
    (await this.#httpClient.delete(`${CATALOGS_PATH}/${encodeURIComponent(id)}`)).expectOk();
  }
}

class CategoriesResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async get(id: string): Promise<Category> {
    const response = await this.#httpClient.get(`${CATEGORIES_PATH}/${encodeURIComponent(id)}`);
    return requireFields(response.json<CategoryData>(), CATEGORY_FIELDS, `Category "${id}"`);
  }

  async template(catalogId: string): Promise<CategoryData> {
    const response = await this.#httpClient.get(
      `${CATALOG_PATH}/${encodeURIComponent(catalogId)}/categories/newcategory`,
    );
    return response.json<CategoryData>();
  }

  async save(category: CategoryData): Promise<Category> {
    const response = await this.#httpClient.post(CATEGORIES_PATH, { json: category });
    return requireFields(response.json<CategoryData>(), CATEGORY_FIELDS, "Saved category");
  }
}

class ProductsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async get(id: string): Promise<CatalogProduct> {
    return requireFields(await this.find(id), CATALOG_PRODUCT_FIELDS, `Product "${id}"`);
  }

  async find(id: string): Promise<CatalogProduct | undefined> {
    const response = await this.#httpClient.get(PRODUCTS_PATH, { query: { ids: id } });
    return optionalFields(
      response.optionalJson<CatalogProductData[]>()?.[0],
      CATALOG_PRODUCT_FIELDS,
      `Product "${id}"`,
    );
  }

  /** Returns an unsaved copy of a product to change and `save` as a new product. */
  async cloneTemplate(id: string): Promise<CatalogProductData> {
    const response = await this.#httpClient.get(`${PRODUCTS_PATH}/${encodeURIComponent(id)}/clone`);
    return response.json<CatalogProductData>();
  }

  async save(product: CatalogProductData): Promise<CatalogProduct> {
    const response = await this.#httpClient.post(PRODUCTS_PATH, { json: product });
    return requireFields(response.json<CatalogProductData>(), CATALOG_PRODUCT_FIELDS, "Saved product");
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(PRODUCTS_PATH, { query: { ids } })).expectOk();
  }
}

class ListEntriesResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async search(criteria: ListEntrySearchCriteria): Promise<ListEntry[]> {
    const response = await this.#httpClient.post(LIST_ENTRIES_PATH, { json: criteria });
    const { results } = response.json<ListEntrySearchResult>();
    return requireFieldsOfEach(results, LIST_ENTRY_FIELDS, "Found list entry");
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.post(`${LIST_ENTRIES_PATH}/delete`, { json: { objectIds: ids } })).expectOk();
  }

  async move(request: ListEntriesMoveRequest): Promise<void> {
    (await this.#httpClient.post(`${LIST_ENTRIES_PATH}/move`, { json: request })).expectOk();
  }
}

export class CatalogClient {
  readonly catalogs: CatalogsResource;
  readonly categories: CategoriesResource;
  readonly products: ProductsResource;
  readonly listEntries: ListEntriesResource;

  constructor(httpClient: HttpClient) {
    this.catalogs = new CatalogsResource(httpClient);
    this.categories = new CategoriesResource(httpClient);
    this.products = new ProductsResource(httpClient);
    this.listEntries = new ListEntriesResource(httpClient);
  }
}
