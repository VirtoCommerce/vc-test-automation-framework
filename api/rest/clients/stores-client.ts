import type { HttpClient } from "../../http/http-client";
import type { Store, StoreData, StoreSearchCriteria } from "../types/store";

import { requireFields } from "@core/required-fields";

import { STORE } from "../types/store";

const STORES_PATH = "/api/stores";

export class StoresClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async get(id: string): Promise<Store> {
    return requireFields(await this.find(id), STORE.fields, `Store "${id}"`);
  }

  async find(id: string): Promise<Store | undefined> {
    const response = await this.#httpClient.get(`${STORES_PATH}/${encodeURIComponent(id)}`);
    return response.optionalRecord(STORE);
  }

  async create(store: StoreData): Promise<Store> {
    const response = await this.#httpClient.post(STORES_PATH, { json: store });
    return response.record(STORE);
  }

  async update(store: StoreData): Promise<void> {
    (await this.#httpClient.put(STORES_PATH, { json: store })).expectOk();
  }

  async search(criteria: StoreSearchCriteria): Promise<Store[]> {
    const response = await this.#httpClient.post(`${STORES_PATH}/search`, { json: criteria });
    return response.results(STORE);
  }

  async listAllowed(userId: string): Promise<Store[]> {
    const response = await this.#httpClient.get(`${STORES_PATH}/allowed/${encodeURIComponent(userId)}`);
    return response.records(STORE);
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(STORES_PATH, { query: { ids } })).expectOk();
  }
}
