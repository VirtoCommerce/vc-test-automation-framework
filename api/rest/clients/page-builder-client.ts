import type { HttpClient } from "../../http/http-client";
import type {
  CreateGroupedPageRequest,
  GroupedPage,
  PagePublishStatus,
  PageSearchCriteria,
  PageStatus,
} from "../types/page-builder";

import { GROUPED_PAGE } from "../types/page-builder";

const PAGES_PATH = "/api/page-builder-pages";

class PagesResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async search(criteria: PageSearchCriteria): Promise<GroupedPage[]> {
    const response = await this.#httpClient.post(`${PAGES_PATH}/search`, { json: criteria });
    return response.results(GROUPED_PAGE);
  }

  async createGroup(request: CreateGroupedPageRequest): Promise<GroupedPage> {
    const response = await this.#httpClient.post(`${PAGES_PATH}/create-group-page`, { json: request });
    return response.record(GROUPED_PAGE);
  }

  /** Sets a page status by publishing, unpublishing (`Draft`) or archiving it; there is no status endpoint. */
  async setStatus(groupId: string, status: PageStatus): Promise<void> {
    switch (status) {
      case "Published":
      case "Draft":
        await this.#setPublished(groupId, status === "Published");
        return;
      case "Archived":
        (await this.#httpClient.post(`${PAGES_PATH}/grouped/archive`, { query: { ids: [groupId] } })).expectOk();
        return;
    }
  }

  /** Reads whether the page is published and whether a saved draft differs from it. */
  async publishStatus(groupId: string): Promise<PagePublishStatus> {
    const path = `${PAGES_PATH}/grouped/publish-status/${encodeURIComponent(groupId)}`;
    return (await this.#httpClient.get(path)).json<PagePublishStatus>();
  }

  async delete(groupId: string): Promise<void> {
    (await this.#httpClient.delete(`${PAGES_PATH}/grouped/${encodeURIComponent(groupId)}`)).expectOk();
  }

  async #setPublished(groupId: string, publish: boolean): Promise<void> {
    const path = `${PAGES_PATH}/grouped/publishing/${encodeURIComponent(groupId)}`;
    (await this.#httpClient.post(path, { query: { publish } })).expectOk();
  }
}

export class PageBuilderClient {
  readonly pages: PagesResource;

  constructor(httpClient: HttpClient) {
    this.pages = new PagesResource(httpClient);
  }
}
