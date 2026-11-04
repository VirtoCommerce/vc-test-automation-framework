import type { HttpClient } from "../../http/http-client";
import type { NotificationMessage, NotificationMessageSearchCriteria } from "../types/notifications";

import { NOTIFICATION_MESSAGE } from "../types/notifications";

const NOTIFICATION_JOURNAL_PATH = "/api/notifications/journal";

class JournalResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async search(criteria: NotificationMessageSearchCriteria): Promise<NotificationMessage[]> {
    const response = await this.#httpClient.post(NOTIFICATION_JOURNAL_PATH, { json: criteria });
    return response.results(NOTIFICATION_MESSAGE);
  }
}

export class NotificationsClient {
  readonly journal: JournalResource;

  constructor(httpClient: HttpClient) {
    this.journal = new JournalResource(httpClient);
  }
}
