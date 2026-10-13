import type { HttpClient } from "../../http/http-client";
import type { WhiteLabelingSetting, WhiteLabelingSettingData } from "../types/white-labeling";

import { requireFields } from "@core/required-fields";

import { WHITE_LABELING_SETTING_FIELDS } from "../types/white-labeling";

const WHITE_LABELING_PATH = "/api/white-labeling";

class SettingsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async create(setting: WhiteLabelingSettingData): Promise<WhiteLabelingSetting> {
    const response = await this.#httpClient.post(WHITE_LABELING_PATH, { json: setting });
    return requireFields(
      response.json<WhiteLabelingSettingData>(),
      WHITE_LABELING_SETTING_FIELDS,
      "Created white-labeling setting",
    );
  }

  async update(setting: WhiteLabelingSettingData): Promise<void> {
    (await this.#httpClient.put(WHITE_LABELING_PATH, { json: setting })).expectOk();
  }
}

export class WhiteLabelingClient {
  readonly settings: SettingsResource;

  constructor(httpClient: HttpClient) {
    this.settings = new SettingsResource(httpClient);
  }
}
