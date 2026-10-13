import type { HttpClient } from "../../http/http-client";
import type {
  OutlineSyncNotification,
  OutlineSyncNotificationData,
  TaggedEntity,
  TaggedItem,
  TaggedItemData,
  TaggedItemSearchCriteria,
  TaggedItemSearchResult,
} from "../types/personalization";

import { optionalFields, requireFields, requireFieldsOfEach } from "@core/required-fields";

import { OUTLINE_SYNC_NOTIFICATION_FIELDS, TAGGED_ITEM_FIELDS } from "../types/personalization";
import { findPushNotification } from "./push-notifications";

const PERSONALIZATION_PATH = "/api/personalization";
const TAGGED_ITEM_PATH = `${PERSONALIZATION_PATH}/taggeditem`;

class TaggedItemsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async get(entityId: string): Promise<TaggedItem> {
    const response = await this.#httpClient.get(`${TAGGED_ITEM_PATH}/${encodeURIComponent(entityId)}`);
    return requireFields(response.json<TaggedItemData>(), TAGGED_ITEM_FIELDS, `Tagged item "${entityId}"`);
  }

  async countTags(entityId: string): Promise<number> {
    const response = await this.#httpClient.get(`${TAGGED_ITEM_PATH}/${encodeURIComponent(entityId)}/tags/count`);
    return response.json<number>();
  }

  async search(criteria: TaggedItemSearchCriteria): Promise<TaggedItem[]> {
    const response = await this.#httpClient.post(`${PERSONALIZATION_PATH}/search`, { json: criteria });
    const { results } = response.json<TaggedItemSearchResult>();
    return requireFieldsOfEach(results, TAGGED_ITEM_FIELDS, "Found tagged item");
  }

  async setTags(entity: TaggedEntity, tags: readonly string[]): Promise<void> {
    const [existing] = await this.search({ entityIds: [entity.entityId] });
    const item: TaggedItemData = { ...entity, id: existing?.id ?? null, tags: [...tags] };
    (await this.#httpClient.put(TAGGED_ITEM_PATH, { json: item })).expectOk();
  }
}

export class PersonalizationClient {
  readonly taggedItems: TaggedItemsResource;
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
    this.taggedItems = new TaggedItemsResource(httpClient);
  }

  async synchronizeOutlines(): Promise<OutlineSyncNotification> {
    const response = await this.#httpClient.post(`${PERSONALIZATION_PATH}/outlines/synchronize`, { json: {} });
    return requireFields(
      response.json<OutlineSyncNotificationData>(),
      OUTLINE_SYNC_NOTIFICATION_FIELDS,
      "Outline synchronization",
    );
  }

  async findSynchronization(notificationId: string): Promise<OutlineSyncNotification | undefined> {
    const synchronization = await findPushNotification<OutlineSyncNotificationData>(this.#httpClient, notificationId);
    return optionalFields(
      synchronization,
      OUTLINE_SYNC_NOTIFICATION_FIELDS,
      `Outline synchronization "${notificationId}"`,
    );
  }
}
