import type { HttpClient } from "../../http/http-client";
import type {
  IndexedDocument,
  IndexingOptions,
  IndexProgressNotification,
  IndexProgressNotificationData,
  IndexState,
  IndexStateData,
} from "../types/search";

import { requireEach, requireFields } from "@core/required-fields";

import { INDEX_PROGRESS_NOTIFICATION_FIELDS, INDEX_STATE_FIELDS } from "../types/search";
import { findPushNotification } from "./push-notifications";

const INDEXES_PATH = "/api/search/indexes";

export class SearchIndexesClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async list(): Promise<IndexState[]> {
    const response = await this.#httpClient.get(INDEXES_PATH);
    return requireEach(response.expectOk().json<IndexStateData[]>(), INDEX_STATE_FIELDS, "Index state");
  }

  async getDocuments(documentType: string, documentId: string): Promise<IndexedDocument[]> {
    const path = `${INDEXES_PATH}/index/${encodeURIComponent(documentType)}/${encodeURIComponent(documentId)}`;
    return (await this.#httpClient.get(path)).expectOk().json<IndexedDocument[]>();
  }

  async startIndexation(options: IndexingOptions[]): Promise<IndexProgressNotification> {
    const response = await this.#httpClient.post(`${INDEXES_PATH}/index`, { json: options });
    return requireFields(
      response.expectOk().json<IndexProgressNotificationData>(),
      INDEX_PROGRESS_NOTIFICATION_FIELDS,
      "Indexation notification",
    );
  }

  async cancelIndexation(jobId: string): Promise<void> {
    (await this.#httpClient.get(`${INDEXES_PATH}/tasks/${encodeURIComponent(jobId)}/cancel`)).expectOk();
  }

  async getProgress(notificationId: string): Promise<IndexProgressNotification> {
    return requireFields(
      await this.findProgress(notificationId),
      INDEX_PROGRESS_NOTIFICATION_FIELDS,
      `Indexation progress "${notificationId}"`,
    );
  }

  async findProgress(notificationId: string): Promise<IndexProgressNotification | undefined> {
    const progress = await findPushNotification<IndexProgressNotificationData>(this.#httpClient, notificationId);
    return progress === undefined
      ? undefined
      : requireFields(progress, INDEX_PROGRESS_NOTIFICATION_FIELDS, `Indexation progress "${notificationId}"`);
  }
}
