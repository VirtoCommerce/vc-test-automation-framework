import type { HttpClient, MultipartFile } from "../../http/http-client";
import type { ContentItem, ContentStatistic, ContentType } from "../types/content";

import { requireFields } from "@core/required-fields";

import { CONTENT_ITEM, CONTENT_STATISTIC } from "../types/content";

function contentPath(contentType: ContentType, storeId: string): string {
  return `/api/content/${contentType}/${encodeURIComponent(storeId)}`;
}

class ItemsResource {
  readonly #httpClient: HttpClient;
  readonly #storeId: string;

  constructor(httpClient: HttpClient, storeId: string) {
    this.#httpClient = httpClient;
    this.#storeId = storeId;
  }

  async upload(contentType: ContentType, folderUrl: string, file: MultipartFile): Promise<ContentItem[]> {
    const response = await this.#httpClient.post(contentPath(contentType, this.#storeId), {
      query: { folderUrl },
      multipart: { file },
    });
    return response.records(CONTENT_ITEM);
  }

  async search(contentType: ContentType, keyword: string): Promise<ContentItem[]> {
    const response = await this.#httpClient.get(`${contentPath(contentType, this.#storeId)}/search`, {
      query: { keyword },
    });
    return response.records(CONTENT_ITEM);
  }

  async getByName(contentType: ContentType, name: string): Promise<ContentItem> {
    return requireFields(
      await this.findByName(contentType, name),
      CONTENT_ITEM.fields,
      `${contentType} item "${name}"`,
    );
  }

  async findByName(contentType: ContentType, name: string): Promise<ContentItem | undefined> {
    return (await this.search(contentType, name)).find((item) => item.name === name);
  }

  /** Reads a content file as text; `undefined` when missing (the platform answers 404). */
  async findText(contentType: ContentType, relativeUrl: string): Promise<string | undefined> {
    const response = await this.#httpClient.get(contentPath(contentType, this.#storeId), { query: { relativeUrl } });
    return response.status === 404 ? undefined : response.expectOk().text;
  }

  async move(contentType: ContentType, oldUrl: string, newUrl: string): Promise<void> {
    const path = `${contentPath(contentType, this.#storeId)}/move`;
    (await this.#httpClient.get(path, { query: { oldUrl, newUrl } })).expectOk();
  }

  async delete(contentType: ContentType, urls: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(contentPath(contentType, this.#storeId), { query: { urls } })).expectOk();
  }
}

class FoldersResource {
  readonly #httpClient: HttpClient;
  readonly #storeId: string;
  readonly #items: ItemsResource;

  constructor(httpClient: HttpClient, storeId: string, items: ItemsResource) {
    this.#httpClient = httpClient;
    this.#storeId = storeId;
    this.#items = items;
  }

  async create(contentType: ContentType, name: string): Promise<void> {
    const response = await this.#httpClient.post(`${contentPath(contentType, this.#storeId)}/folder`, {
      json: { name, type: "folder" },
    });
    response.expectOk();
  }

  async delete(contentType: ContentType, name: string): Promise<void> {
    const folder = await this.#items.findByName(contentType, name);
    if (folder !== undefined) {
      await this.#items.delete(contentType, [folder.url]);
    }
  }
}

export class ContentClient {
  readonly items: ItemsResource;
  readonly folders: FoldersResource;
  readonly #httpClient: HttpClient;
  readonly #storeId: string;

  constructor(httpClient: HttpClient, storeId: string) {
    this.#httpClient = httpClient;
    this.#storeId = storeId;
    this.items = new ItemsResource(httpClient, storeId);
    this.folders = new FoldersResource(httpClient, storeId, this.items);
  }

  async getStatistic(): Promise<ContentStatistic> {
    const response = await this.#httpClient.get(`/api/content/${encodeURIComponent(this.#storeId)}/stats`);
    return response.record(CONTENT_STATISTIC);
  }
}
