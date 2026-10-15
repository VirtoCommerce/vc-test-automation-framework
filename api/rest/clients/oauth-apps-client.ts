import type { HttpClient } from "../../http/http-client";
import type { OAuthApp, OAuthAppData, OAuthAppSearchCriteria } from "../types/security";

import { OAUTH_APP } from "../types/security";

const OAUTH_APPS_PATH = "/api/platform/oauthapps";

export class OAuthAppsClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async create(app: OAuthAppData): Promise<OAuthApp> {
    const response = await this.#httpClient.post(OAUTH_APPS_PATH, { json: app });
    return response.record(OAUTH_APP);
  }

  async search(criteria: OAuthAppSearchCriteria): Promise<OAuthApp[]> {
    const response = await this.#httpClient.post(`${OAUTH_APPS_PATH}/search`, { json: criteria });
    return response.results(OAUTH_APP);
  }

  async delete(clientIds: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(OAUTH_APPS_PATH, { query: { clientIds } })).expectOk();
  }
}
