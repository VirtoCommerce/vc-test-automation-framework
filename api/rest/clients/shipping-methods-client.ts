import type { HttpClient } from "../../http/http-client";
import type {
  ShippingMethod,
  ShippingMethodData,
  ShippingMethodsSearchCriteria,
  ShippingMethodsSearchResult,
} from "../types/shipping";

import { requireFieldsOfEach } from "@core/required-fields";

import { SHIPPING_METHOD_FIELDS } from "../types/shipping";

const SHIPPING_PATH = "/api/shipping";

export class ShippingMethodsClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async search(criteria: ShippingMethodsSearchCriteria): Promise<ShippingMethod[]> {
    const response = await this.#httpClient.post(`${SHIPPING_PATH}/search`, { json: criteria });
    const { results } = response.json<ShippingMethodsSearchResult>();
    return requireFieldsOfEach(results, SHIPPING_METHOD_FIELDS, "Found shipping method");
  }

  async update(shippingMethod: ShippingMethodData): Promise<void> {
    (await this.#httpClient.put(SHIPPING_PATH, { json: shippingMethod })).expectOk();
  }
}
