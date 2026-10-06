import type { HttpClient } from "../../http/http-client";
import type { OAuthApp, OAuthAppData, OAuthAppSearchCriteria, OAuthAppSearchResult } from "../types/security";

import { requireEach, requireFields } from "@core/required-fields";

import { OAUTH_APP_FIELDS } from "../types/security";

const OAUTH_APPS_PATH = "/api/platform/oauthapps";

export class OAuthAppsClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async create(app: OAuthAppData): Promise<OAuthApp> {
    const response = await this.#httpClient.post(OAUTH_APPS_PATH, { json: app });
    return requireFields(response.expectOk().json<OAuthAppData>(), OAUTH_APP_FIELDS, "Created OAuth app");
  }

  async search(criteria: OAuthAppSearchCriteria): Promise<OAuthApp[]> {
    const response = await this.#httpClient.post(`${OAUTH_APPS_PATH}/search`, { json: criteria });
    const { results } = response.expectOk().json<OAuthAppSearchResult>();
    return requireEach(results, OAUTH_APP_FIELDS, "Found OAuth app");
  }

  async delete(clientIds: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(OAUTH_APPS_PATH, { query: { clientIds } })).expectOk();
  }
}
