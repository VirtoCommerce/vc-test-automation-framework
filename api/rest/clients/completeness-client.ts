import type { HttpClient } from "../../http/http-client";
import type {
  CompletenessChannel,
  CompletenessChannelData,
  CompletenessChannelSearchCriteria,
  CompletenessEntry,
  CompletenessEntryData,
  EvaluateCompletenessNotification,
  EvaluateCompletenessNotificationData,
} from "../types/completeness";

import { optionalFields, requireFields } from "@core/required-fields";

import { COMPLETENESS_CHANNEL, COMPLETENESS_ENTRY, EVALUATE_COMPLETENESS_NOTIFICATION } from "../types/completeness";
import { findPushNotification } from "./push-notifications";

const COMPLETENESS_PATH = "/api/completeness";
const CHANNELS_PATH = `${COMPLETENESS_PATH}/channels`;

class ChannelsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async get(id: string): Promise<CompletenessChannel> {
    return requireFields(await this.find(id), COMPLETENESS_CHANNEL.fields, `Channel "${id}"`);
  }

  /** Finds a channel; `undefined` when missing (the platform answers 404, not 200 with `null`). */
  async find(id: string): Promise<CompletenessChannel | undefined> {
    const response = await this.#httpClient.get(`${CHANNELS_PATH}/${encodeURIComponent(id)}`);
    const channel = response.optionalJson<CompletenessChannelData>({ allow404: true });
    return optionalFields(channel, COMPLETENESS_CHANNEL.fields, `Channel "${id}"`);
  }

  async create(channel: CompletenessChannelData): Promise<CompletenessChannel> {
    const response = await this.#httpClient.post(CHANNELS_PATH, { json: channel });
    return response.record(COMPLETENESS_CHANNEL);
  }

  async update(channel: CompletenessChannelData): Promise<void> {
    (await this.#httpClient.put(CHANNELS_PATH, { json: channel })).expectOk();
  }

  async search(criteria: CompletenessChannelSearchCriteria): Promise<CompletenessChannel[]> {
    const response = await this.#httpClient.post(`${CHANNELS_PATH}/search`, { json: criteria });
    return response.results(COMPLETENESS_CHANNEL);
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(CHANNELS_PATH, { query: { ids } })).expectOk();
  }

  async evaluate(id: string): Promise<EvaluateCompletenessNotification> {
    const response = await this.#httpClient.post(`${CHANNELS_PATH}/${encodeURIComponent(id)}/evaluate`);
    return response.record(EVALUATE_COMPLETENESS_NOTIFICATION);
  }

  async evaluateProducts(channelId: string, productIds: readonly string[]): Promise<CompletenessEntry[]> {
    const path = `${CHANNELS_PATH}/${encodeURIComponent(channelId)}/products/evaluate`;
    const response = await this.#httpClient.post(path, { json: productIds });
    return response.records(COMPLETENESS_ENTRY);
  }
}

class EntriesResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async saveMany(entries: readonly CompletenessEntryData[]): Promise<void> {
    (await this.#httpClient.put(`${COMPLETENESS_PATH}/entries`, { json: entries })).expectOk();
  }
}

export class CompletenessClient {
  readonly channels: ChannelsResource;
  readonly entries: EntriesResource;
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
    this.channels = new ChannelsResource(httpClient);
    this.entries = new EntriesResource(httpClient);
  }

  async listEvaluators(): Promise<string[]> {
    return (await this.#httpClient.get(`${COMPLETENESS_PATH}/evaluators`)).json<string[]>();
  }

  async findEvaluation(notificationId: string): Promise<EvaluateCompletenessNotification | undefined> {
    const evaluation = await findPushNotification<EvaluateCompletenessNotificationData>(
      this.#httpClient,
      notificationId,
    );
    return optionalFields(
      evaluation,
      EVALUATE_COMPLETENESS_NOTIFICATION.fields,
      `Completeness evaluation "${notificationId}"`,
    );
  }
}
