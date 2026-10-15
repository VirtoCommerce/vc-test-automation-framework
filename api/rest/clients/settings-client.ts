import type { HttpClient } from "../../http/http-client";
import type { SettingEntry, SettingEntryData } from "../types/settings";

import { SETTING_ENTRY } from "../types/settings";

const SETTINGS_PATH = "/api/platform/settings";

export class SettingsClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async get(name: string): Promise<SettingEntry> {
    const response = await this.#httpClient.get(`${SETTINGS_PATH}/${encodeURIComponent(name)}`);
    return response.record(SETTING_ENTRY);
  }

  async list(): Promise<SettingEntry[]> {
    return this.#list(SETTINGS_PATH);
  }

  async listByModule(moduleId: string): Promise<SettingEntry[]> {
    return this.#list(`${SETTINGS_PATH}/modules/${encodeURIComponent(moduleId)}`);
  }

  async getUiCustomization(): Promise<SettingEntry> {
    const response = await this.#httpClient.get(`${SETTINGS_PATH}/ui/customization`);
    return response.record(SETTING_ENTRY);
  }

  async getValues(name: string): Promise<unknown[]> {
    const response = await this.#httpClient.get(`${SETTINGS_PATH}/values/${encodeURIComponent(name)}`);
    return response.json<unknown[]>();
  }

  async save(settings: readonly SettingEntryData[]): Promise<void> {
    (await this.#httpClient.post(SETTINGS_PATH, { json: settings })).expectOk();
  }

  async #list(path: string): Promise<SettingEntry[]> {
    const response = await this.#httpClient.get(path);
    return response.records(SETTING_ENTRY);
  }
}
