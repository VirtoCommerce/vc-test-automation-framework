import type { HttpClient } from "../../http/http-client";
import type { ModuleDescriptorData } from "../types/modules";
import type {
  AppDescriptor,
  AppDescriptorData,
  ChangeLogSearchCriteria,
  ChangeLogSearchResult,
  LastModifiedResponse,
  PushNotificationSearchCriteria,
  PushNotificationSearchResult,
  SystemInfo,
} from "../types/platform";

import { requireEach, requireFields } from "@core/required-fields";

import { APP_DESCRIPTOR_FIELDS } from "../types/platform";
import { PUSH_NOTIFICATIONS_PATH } from "./push-notifications";

export class PlatformClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async listApps(): Promise<AppDescriptor[]> {
    const response = await this.#httpClient.get("/api/platform/apps");
    return requireEach(response.expectOk().json<AppDescriptorData[]>(), APP_DESCRIPTOR_FIELDS, "Platform app");
  }

  async getSystemInfo(): Promise<SystemInfo> {
    return (await this.#httpClient.get("/api/platform/diagnostics/systeminfo")).expectOk().json<SystemInfo>();
  }

  async listModulesWithErrors(): Promise<ModuleDescriptorData[]> {
    return (await this.#httpClient.get("/api/platform/diagnostics/errors")).expectOk().json<ModuleDescriptorData[]>();
  }

  async getLastModifiedDate(): Promise<string> {
    const response = await this.#httpClient.get("/api/changes/lastmodifieddate");
    const { lastModifiedDate } = requireFields(
      response.expectOk().json<LastModifiedResponse>(),
      ["lastModifiedDate"],
      "Last modified date",
    );
    return lastModifiedDate;
  }

  async forceChanges(): Promise<void> {
    (await this.#httpClient.post("/api/changes/force")).expectOk();
  }

  async searchChangeLog(criteria: ChangeLogSearchCriteria): Promise<ChangeLogSearchResult> {
    const response = await this.#httpClient.post("/api/platform/changelog/v2/search", { json: criteria });
    return response.expectOk().json<ChangeLogSearchResult>();
  }

  async searchPushNotifications(criteria: PushNotificationSearchCriteria): Promise<PushNotificationSearchResult> {
    return (await this.#httpClient.post(PUSH_NOTIFICATIONS_PATH, { json: criteria }))
      .expectOk()
      .json<PushNotificationSearchResult>();
  }

  async markAllPushNotificationsAsRead(): Promise<void> {
    (await this.#httpClient.post(`${PUSH_NOTIFICATIONS_PATH}/markAllAsRead`)).expectOk();
  }
}
