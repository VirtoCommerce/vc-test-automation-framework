import type { HttpClient } from "../../http/http-client";
import type {
  IndexedDocument,
  IndexingOptions,
  IndexProgressNotification,
  IndexProgressNotificationData,
  IndexState,
} from "../types/search";

import { optionalFields, requireFields } from "@core/required-fields";

import { INDEX_PROGRESS_NOTIFICATION, INDEX_STATE } from "../types/search";
import { findPushNotification } from "./push-notifications";

const INDEXES_PATH = "/api/search/indexes";

export class SearchIndexesClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async list(): Promise<IndexState[]> {
    const response = await this.#httpClient.get(INDEXES_PATH);
    return response.records(INDEX_STATE);
  }

  async getDocuments(documentType: string, documentId: string): Promise<IndexedDocument[]> {
    const path = `${INDEXES_PATH}/index/${encodeURIComponent(documentType)}/${encodeURIComponent(documentId)}`;
    return (await this.#httpClient.get(path)).json<IndexedDocument[]>();
  }

  async startIndexation(options: readonly IndexingOptions[]): Promise<IndexProgressNotification> {
    const response = await this.#httpClient.post(`${INDEXES_PATH}/index`, { json: options });
    return response.record(INDEX_PROGRESS_NOTIFICATION);
  }

  async cancelIndexation(jobId: string): Promise<void> {
    (await this.#httpClient.get(`${INDEXES_PATH}/tasks/${encodeURIComponent(jobId)}/cancel`)).expectOk();
  }

  async getProgress(notificationId: string): Promise<IndexProgressNotification> {
    return requireFields(
      await this.findProgress(notificationId),
      INDEX_PROGRESS_NOTIFICATION.fields,
      `Indexation progress "${notificationId}"`,
    );
  }

  async findProgress(notificationId: string): Promise<IndexProgressNotification | undefined> {
    const progress = await findPushNotification<IndexProgressNotificationData>(this.#httpClient, notificationId);
    return optionalFields(progress, INDEX_PROGRESS_NOTIFICATION.fields, `Indexation progress "${notificationId}"`);
  }
}
