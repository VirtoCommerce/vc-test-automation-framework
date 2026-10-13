import type { HttpClient } from "../../http/http-client";
import type {
  NotificationJournalPage,
  NotificationMessage,
  NotificationMessageSearchCriteria,
} from "../types/notifications";

import { requireFieldsOfEach } from "@core/required-fields";

import { NOTIFICATION_MESSAGE_FIELDS } from "../types/notifications";

const NOTIFICATION_JOURNAL_PATH = "/api/notifications/journal";

class JournalResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async search(criteria: NotificationMessageSearchCriteria): Promise<NotificationMessage[]> {
    const response = await this.#httpClient.post(NOTIFICATION_JOURNAL_PATH, { json: criteria });
    const { results } = response.json<NotificationJournalPage>();
    return requireFieldsOfEach(results, NOTIFICATION_MESSAGE_FIELDS, "Journal notification");
  }
}

export class NotificationsClient {
  readonly journal: JournalResource;

  constructor(httpClient: HttpClient) {
    this.journal = new JournalResource(httpClient);
  }
}
