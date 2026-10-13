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

import { optionalFields, requireFields, requireFieldsOfEach } from "@core/required-fields";

import { NAMED_ENTITY_FIELDS } from "../types/marketing";

const MARKETING_PATH = "/api/marketing";
const CONTENT_FOLDERS_PATH = `${MARKETING_PATH}/contentfolders`;
const CONTENT_ITEMS_PATH = `${MARKETING_PATH}/contentitems`;
const CONTENT_PLACES_PATH = `${MARKETING_PATH}/contentplaces`;
const CONTENT_PUBLICATIONS_PATH = `${MARKETING_PATH}/contentpublications`;

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

  /** Finds a record; `undefined` when missing (the platform answers 404, not 200 with `null`). */
  async find(id: string): Promise<NamedEntity<Data> | undefined> {
    const response = await this.#httpClient.get(`${this.#path}/${encodeURIComponent(id)}`);
    return optionalFields(
      response.optionalJson<Data>({ allow404: true }),
      NAMED_ENTITY_FIELDS,
      `${this.#label} "${id}"`,
    );
  }

  async create(entity: Data): Promise<NamedEntity<Data>> {
    const response = await this.#httpClient.post(this.#path, { json: entity });
    return requireFields(response.json<Data>(), NAMED_ENTITY_FIELDS, `Created ${this.#label}`);
  }

  async update(entity: Data): Promise<void> {
    (await this.#httpClient.put(this.#path, { json: entity })).expectOk();
  }

  async search(criteria: Criteria): Promise<NamedEntity<Data>[]> {
    const response = await this.#httpClient.post(`${this.#path}/search`, { json: criteria });
    const { results } = response.json<{ results?: Data[] | null }>();
    return requireFieldsOfEach(results, NAMED_ENTITY_FIELDS, `Found ${this.#label}`);
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(this.#path, { query: { ids } })).expectOk();
  }
}

class PublicationsResource extends DynamicContentResource<
  DynamicContentPublicationData,
  DynamicContentPublicationSearchCriteria
> {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    super(httpClient, CONTENT_PUBLICATIONS_PATH, "Content publication");
    this.#httpClient = httpClient;
  }

  async template(): Promise<DynamicContentPublicationData> {
    const response = await this.#httpClient.get(`${CONTENT_PUBLICATIONS_PATH}/new`);
    return response.json<DynamicContentPublicationData>();
  }
}

export class DynamicContentClient {
  readonly folders: DynamicContentResource<DynamicContentFolderData>;
  readonly items: DynamicContentResource<DynamicContentItemData, DynamicContentItemSearchCriteria>;
  readonly places: DynamicContentResource<DynamicContentPlaceData, DynamicContentPlaceSearchCriteria>;
  readonly publications: PublicationsResource;

  constructor(httpClient: HttpClient) {
    this.folders = new DynamicContentResource(httpClient, CONTENT_FOLDERS_PATH, "Content folder");
    this.items = new DynamicContentResource(httpClient, CONTENT_ITEMS_PATH, "Content item");
    this.places = new DynamicContentResource(httpClient, CONTENT_PLACES_PATH, "Content place");
    this.publications = new PublicationsResource(httpClient);
  }
}
