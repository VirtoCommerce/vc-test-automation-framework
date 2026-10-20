import type { HttpClient } from "../../http/http-client";
import type { DynamicProperty, DynamicPropertyData, DynamicPropertySearchCriteria } from "../types/platform";

import { DYNAMIC_PROPERTY } from "../types/platform";

const DYNAMIC_PATH = "/api/platform/dynamic";
const PROPERTIES_PATH = `${DYNAMIC_PATH}/properties`;

export class DynamicPropertiesClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async listObjectTypes(): Promise<string[]> {
    return (await this.#httpClient.get(`${DYNAMIC_PATH}/types`)).json<string[]>();
  }

  async create(property: DynamicPropertyData): Promise<DynamicProperty> {
    const response = await this.#httpClient.post(PROPERTIES_PATH, { json: property });
    return response.record(DYNAMIC_PROPERTY);
  }

  async search(criteria: DynamicPropertySearchCriteria): Promise<DynamicProperty[]> {
    const response = await this.#httpClient.post(`${PROPERTIES_PATH}/search`, { json: criteria });
    return response.results(DYNAMIC_PROPERTY);
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(PROPERTIES_PATH, { query: { propertyIds: ids } })).expectOk();
  }
}
