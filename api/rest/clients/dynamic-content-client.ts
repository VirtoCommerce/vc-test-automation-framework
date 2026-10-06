import type { HttpClient } from "../../http/http-client";
import type {
  DynamicContentFolderData,
  DynamicContentItemData,
  DynamicContentItemSearchCriteria,
  DynamicContentPlaceData,
  DynamicContentPlaceSearchCriteria,
  DynamicContentPublicationData,
  DynamicContentPublicationSearchCriteria,
  NamedEntity,
  NamedEntityData,
} from "../types/marketing";

import { requireEach, requireFields } from "@core/required-fields";

import { NAMED_ENTITY_FIELDS } from "../types/marketing";

export class DynamicContentResource<Data extends NamedEntityData, Criteria = never> {
  readonly #httpClient: HttpClient;
  readonly #path: string;
  readonly #label: string;

  constructor(httpClient: HttpClient, path: string, label: string) {
    this.#httpClient = httpClient;
    this.#path = path;
    this.#label = label;
  }

  async get(id: string): Promise<NamedEntity<Data>> {
    return requireFields(await this.find(id), NAMED_ENTITY_FIELDS, `${this.#label} "${id}"`);
  }

  async find(id: string): Promise<NamedEntity<Data> | undefined> {
    const response = await this.#httpClient.get(`${this.#path}/${encodeURIComponent(id)}`);
    const entity = response.jsonOrUndefined<Data>();
    return entity === undefined ? undefined : requireFields(entity, NAMED_ENTITY_FIELDS, `${this.#label} "${id}"`);
  }

  async create(entity: Data): Promise<NamedEntity<Data>> {
    const response = await this.#httpClient.post(this.#path, { json: entity });
    return requireFields(response.expectOk().json<Data>(), NAMED_ENTITY_FIELDS, `Created ${this.#label}`);
  }

  async update(entity: Data): Promise<void> {
    (await this.#httpClient.put(this.#path, { json: entity })).expectOk();
  }

  async search(criteria: Criteria): Promise<NamedEntity<Data>[]> {
    const response = await this.#httpClient.post(`${this.#path}/search`, { json: criteria });
    const { results } = response.expectOk().json<{ results?: Data[] | null }>();
    return requireEach(results, NAMED_ENTITY_FIELDS, `Found ${this.#label}`);
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(this.#path, { query: { ids } })).expectOk();
  }
}

export class DynamicContentClient {
  readonly folders: DynamicContentResource<DynamicContentFolderData>;
  readonly items: DynamicContentResource<DynamicContentItemData, DynamicContentItemSearchCriteria>;
  readonly places: DynamicContentResource<DynamicContentPlaceData, DynamicContentPlaceSearchCriteria>;
  readonly publications: DynamicContentResource<DynamicContentPublicationData, DynamicContentPublicationSearchCriteria>;
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
    this.folders = new DynamicContentResource(httpClient, "/api/marketing/contentfolders", "Content folder");
    this.items = new DynamicContentResource(httpClient, "/api/marketing/contentitems", "Content item");
    this.places = new DynamicContentResource(httpClient, "/api/marketing/contentplaces", "Content place");
    this.publications = new DynamicContentResource(
      httpClient,
      "/api/marketing/contentpublications",
      "Content publication",
    );
  }

  async newPublication(): Promise<DynamicContentPublicationData> {
    const response = await this.#httpClient.get("/api/marketing/contentpublications/new");
    return response.expectOk().json<DynamicContentPublicationData>();
  }
}
