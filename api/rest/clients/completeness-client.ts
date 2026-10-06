import type { HttpClient } from "../../http/http-client";
import type {
  CompletenessChannel,
  CompletenessChannelData,
  CompletenessChannelSearchCriteria,
  CompletenessChannelSearchResult,
  CompletenessEntry,
  CompletenessEntryData,
  EvaluateCompletenessNotification,
  EvaluateCompletenessNotificationData,
} from "../types/completeness";

import { requireEach, requireFields } from "@core/required-fields";

import {
  COMPLETENESS_CHANNEL_FIELDS,
  COMPLETENESS_ENTRY_FIELDS,
  EVALUATE_COMPLETENESS_NOTIFICATION_FIELDS,
} from "../types/completeness";
import { findPushNotification } from "./push-notifications";

const COMPLETENESS_PATH = "/api/completeness";
const CHANNELS_PATH = `${COMPLETENESS_PATH}/channels`;

export class CompletenessClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async getChannel(id: string): Promise<CompletenessChannel> {
    return requireFields(await this.findChannel(id), COMPLETENESS_CHANNEL_FIELDS, `Channel "${id}"`);
  }

  async findChannel(id: string): Promise<CompletenessChannel | undefined> {
    const response = await this.#httpClient.get(`${CHANNELS_PATH}/${encodeURIComponent(id)}`);
    const channel = response.jsonOrUndefined<CompletenessChannelData>();
    return channel === undefined ? undefined : requireFields(channel, COMPLETENESS_CHANNEL_FIELDS, `Channel "${id}"`);
  }

  async createChannel(channel: CompletenessChannelData): Promise<CompletenessChannel> {
    const response = await this.#httpClient.post(CHANNELS_PATH, { json: channel });
    return requireFields(
      response.expectOk().json<CompletenessChannelData>(),
      COMPLETENESS_CHANNEL_FIELDS,
      "Created channel",
    );
  }

  async updateChannel(channel: CompletenessChannelData): Promise<void> {
    (await this.#httpClient.put(CHANNELS_PATH, { json: channel })).expectOk();
  }

  async searchChannels(criteria: CompletenessChannelSearchCriteria): Promise<CompletenessChannel[]> {
    const response = await this.#httpClient.post(`${CHANNELS_PATH}/search`, { json: criteria });
    const { results } = response.expectOk().json<CompletenessChannelSearchResult>();
    return requireEach(results, COMPLETENESS_CHANNEL_FIELDS, "Found channel");
  }

  async deleteChannel(id: string): Promise<void> {
    (await this.#httpClient.delete(CHANNELS_PATH, { query: { ids: id } })).expectOk();
  }

  async listEvaluators(): Promise<string[]> {
    return (await this.#httpClient.get(`${COMPLETENESS_PATH}/evaluators`)).expectOk().json<string[]>();
  }

  async evaluateChannel(id: string): Promise<EvaluateCompletenessNotification> {
    const response = await this.#httpClient.post(`${CHANNELS_PATH}/${encodeURIComponent(id)}/evaluate`);
    return requireFields(
      response.expectOk().json<EvaluateCompletenessNotificationData>(),
      EVALUATE_COMPLETENESS_NOTIFICATION_FIELDS,
      `Evaluation of channel "${id}"`,
    );
  }

  async findEvaluation(notificationId: string): Promise<EvaluateCompletenessNotification | undefined> {
    const evaluation = await findPushNotification<EvaluateCompletenessNotificationData>(
      this.#httpClient,
      notificationId,
    );
    return evaluation === undefined
      ? undefined
      : requireFields(
          evaluation,
          EVALUATE_COMPLETENESS_NOTIFICATION_FIELDS,
          `Completeness evaluation "${notificationId}"`,
        );
  }

  async evaluateProducts(channelId: string, productIds: string[]): Promise<CompletenessEntry[]> {
    const path = `${CHANNELS_PATH}/${encodeURIComponent(channelId)}/products/evaluate`;
    const response = await this.#httpClient.post(path, { json: productIds });
    return requireEach(
      response.expectOk().json<CompletenessEntryData[]>(),
      COMPLETENESS_ENTRY_FIELDS,
      "Evaluated completeness entry",
    );
  }

  async saveEntries(entries: CompletenessEntryData[]): Promise<void> {
    (await this.#httpClient.put(`${COMPLETENESS_PATH}/entries`, { json: entries })).expectOk();
  }
}
