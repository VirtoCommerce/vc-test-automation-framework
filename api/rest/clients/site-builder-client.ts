import type { output } from "zod";
import type { HttpClient } from "../../http/http-client";
import type { PreviewAuthCodeRequest } from "../types/site-builder";

import { PREVIEW_AUTH_CODE } from "../types/site-builder";

const PREVIEW_AUTH_PATH = "/api/site-builder/preview-auth";

class PreviewAuthResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  /**
   * Asks for a one-time code to preview the store as one of its preview users; the caller needs
   * `builder:preview-as` in the store, and the user must be listed in `SiteBuilder.Store.PreviewUserIds` and be a
   * customer account.
   *
   * @throws HttpError `403` when the user is not listed or not a customer, `401` when signed out.
   */
  async createCode(request: PreviewAuthCodeRequest): Promise<output<typeof PREVIEW_AUTH_CODE>> {
    return (await this.#httpClient.post(`${PREVIEW_AUTH_PATH}/code`, { json: request })).parse(PREVIEW_AUTH_CODE);
  }
}

export class SiteBuilderClient {
  readonly previewAuth: PreviewAuthResource;

  constructor(httpClient: HttpClient) {
    this.previewAuth = new PreviewAuthResource(httpClient);
  }
}
