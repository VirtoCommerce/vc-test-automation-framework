import type { HttpClient, MultipartFile } from "../../http/http-client";
import type { BlobEntry, BlobEntrySearchResult, BlobInfo, BlobInfoData } from "../types/assets";

import { requireFields, requireFieldsOfEach } from "@core/required-fields";

import { BLOB_FIELDS } from "../types/assets";

const ASSETS_PATH = "/api/assets";

class FoldersResource {
  readonly #httpClient: HttpClient;
  readonly #assets: AssetsClient;

  constructor(httpClient: HttpClient, assets: AssetsClient) {
    this.#httpClient = httpClient;
    this.#assets = assets;
  }

  async create(name: string, parentUrl = ""): Promise<void> {
    (await this.#httpClient.post(`${ASSETS_PATH}/folder`, { json: { name, parentUrl } })).expectOk();
  }

  async delete(name: string): Promise<void> {
    const folder = await this.#assets.find(name);
    if (folder !== undefined) {
      await this.#assets.delete([folder.url]);
    }
  }
}

export class AssetsClient {
  readonly folders: FoldersResource;
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
    this.folders = new FoldersResource(httpClient, this);
  }

  async list(folderUrl = ""): Promise<BlobEntry[]> {
    const response = await this.#httpClient.get(ASSETS_PATH, { query: { folderUrl } });
    const { results } = response.json<BlobEntrySearchResult>();
    return requireFieldsOfEach(results, BLOB_FIELDS, `Asset entry in "${folderUrl}"`);
  }

  async find(name: string, folderUrl = ""): Promise<BlobEntry | undefined> {
    return (await this.list(folderUrl)).find((entry) => entry.name === name);
  }

  async uploadFromUrl(folderUrl: string, url: string): Promise<BlobInfo> {
    const response = await this.#httpClient.post(ASSETS_PATH, { query: { folderUrl, url } });
    const [file] = response.json<BlobInfoData[]>();
    return requireFields(file, BLOB_FIELDS, `File uploaded from ${url}`);
  }

  async upload(folderUrl: string, file: MultipartFile): Promise<BlobInfo> {
    const response = await this.#httpClient.post(ASSETS_PATH, { query: { folderUrl }, multipart: { file } });
    const [uploaded] = response.json<BlobInfoData[]>();
    return requireFields(uploaded, BLOB_FIELDS, `File ${file.name} uploaded to "${folderUrl}"`);
  }

  async uploadToLocalStorage(file: MultipartFile): Promise<BlobInfo> {
    const response = await this.#httpClient.post(`${ASSETS_PATH}/localstorage`, { multipart: { file } });
    const [uploaded] = response.json<BlobInfoData[]>();
    return requireFields(uploaded, BLOB_FIELDS, `File ${file.name} uploaded to local storage`);
  }

  async download(url: string): Promise<string> {
    return (await this.#httpClient.get(url)).expectOk().text;
  }

  async delete(urls: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(ASSETS_PATH, { query: { urls } })).expectOk();
  }
}
