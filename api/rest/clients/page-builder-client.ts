import type { HttpClient } from "../../http/http-client";
import type {
  CreateGroupedPageRequest,
  GroupedPage,
  GroupedPageData,
  GroupedPageSearchResult,
  PagePublishStatus,
  PageSearchCriteria,
  PageStatus,
  PermalinkUsage,
} from "../types/page-builder";

import { requireFields, requireFieldsOfEach } from "@core/required-fields";

import { GROUPED_PAGE_FIELDS } from "../types/page-builder";

const PAGES_PATH = "/api/page-builder-pages";

class PagesResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async search(criteria: PageSearchCriteria): Promise<GroupedPage[]> {
    const response = await this.#httpClient.post(`${PAGES_PATH}/search`, { json: criteria });
    const { results } = response.json<GroupedPageSearchResult>();
    return requireFieldsOfEach(results, GROUPED_PAGE_FIELDS, "Found page");
  }

  async createGroup(request: CreateGroupedPageRequest): Promise<GroupedPage> {
    const response = await this.#httpClient.post(`${PAGES_PATH}/create-group-page`, { json: request });
    return requireFields(response.json<GroupedPageData>(), GROUPED_PAGE_FIELDS, "Created page");
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

  /**
   * Publishes the page's draft. Rejected with 409 while another published page has its permalink for the same
   * visitors, unless `unpublishConflicting` unpublishes those pages in the same save.
   */
  async publish(groupId: string, options: { readonly unpublishConflicting: boolean }): Promise<void> {
    const path = `${PAGES_PATH}/grouped/publishing/${encodeURIComponent(groupId)}`;
    const query = { publish: true, unpublishConflicting: options.unpublishConflicting };
    (await this.#httpClient.post(path, { query })).expectOk();
  }

  /** Lists the other pages of the store that use the permalink of `page` as given, with their conflicts. */
  async permalinkUsages(page: GroupedPageData): Promise<PermalinkUsage[]> {
    const response = await this.#httpClient.post(`${PAGES_PATH}/grouped/permalink-usages`, { json: page });
    return response.json<PermalinkUsage[]>();
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
