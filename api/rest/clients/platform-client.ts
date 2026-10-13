import type { HttpClient } from "../../http/http-client";
import type { ModuleDescriptor, ModuleDescriptorData } from "../types/modules";
import type {
  AppDescriptor,
  AppDescriptorData,
  ChangeLogSearchCriteria,
  ChangeLogSearchResult,
  LastModifiedResponse,
  OperationLog,
  PushNotificationPage,
  PushNotificationSearchCriteria,
  PushNotificationSearchResult,
  SystemInfo,
  SystemInfoData,
} from "../types/platform";

import { requireFields, requireFieldsOfEach } from "@core/required-fields";

import { MODULE_DESCRIPTOR_FIELDS } from "../types/modules";
import {
  APP_DESCRIPTOR_FIELDS,
  OPERATION_LOG_FIELDS,
  PUSH_NOTIFICATION_PAGE_FIELDS,
  SYSTEM_INFO_FIELDS,
} from "../types/platform";
import { PUSH_NOTIFICATIONS_PATH } from "./push-notifications";

const PLATFORM_PATH = "/api/platform";
const APPS_PATH = `${PLATFORM_PATH}/apps`;
const DIAGNOSTICS_PATH = `${PLATFORM_PATH}/diagnostics`;
const CHANGE_LOG_SEARCH_PATH = `${PLATFORM_PATH}/changelog/v2/search`;
const CHANGES_PATH = "/api/changes";

class AppsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async list(): Promise<AppDescriptor[]> {
    const response = await this.#httpClient.get(APPS_PATH);
    return requireFieldsOfEach(response.json<AppDescriptorData[]>(), APP_DESCRIPTOR_FIELDS, "Platform app");
  }
}

class ChangeLogResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async search(criteria: ChangeLogSearchCriteria): Promise<OperationLog[]> {
    const response = await this.#httpClient.post(CHANGE_LOG_SEARCH_PATH, { json: criteria });
    const { results } = response.json<ChangeLogSearchResult>();
    return requireFieldsOfEach(results, OPERATION_LOG_FIELDS, "Change log entry");
  }
}

class PushNotificationsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async search(criteria: PushNotificationSearchCriteria): Promise<PushNotificationPage> {
    const response = await this.#httpClient.post(PUSH_NOTIFICATIONS_PATH, { json: criteria });
    return requireFields(
      response.json<PushNotificationSearchResult>(),
      PUSH_NOTIFICATION_PAGE_FIELDS,
      "Push notification page",
    );
  }

  async markAllAsRead(): Promise<void> {
    (await this.#httpClient.post(`${PUSH_NOTIFICATIONS_PATH}/markAllAsRead`)).expectOk();
  }
}

export class PlatformClient {
  readonly apps: AppsResource;
  readonly changeLog: ChangeLogResource;
  readonly pushNotifications: PushNotificationsResource;
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
    this.apps = new AppsResource(httpClient);
    this.changeLog = new ChangeLogResource(httpClient);
    this.pushNotifications = new PushNotificationsResource(httpClient);
  }

  async getSystemInfo(): Promise<SystemInfo> {
    const response = await this.#httpClient.get(`${DIAGNOSTICS_PATH}/systeminfo`);
    return requireFields(response.json<SystemInfoData>(), SYSTEM_INFO_FIELDS, "System info");
  }

  async listModulesWithErrors(): Promise<ModuleDescriptor[]> {
    const response = await this.#httpClient.get(`${DIAGNOSTICS_PATH}/errors`);
    return requireFieldsOfEach(response.json<ModuleDescriptorData[]>(), MODULE_DESCRIPTOR_FIELDS, "Module with errors");
  }

  async getLastModifiedDate(): Promise<string> {
    const response = await this.#httpClient.get(`${CHANGES_PATH}/lastmodifieddate`);
    const { lastModifiedDate } = requireFields(
      response.json<LastModifiedResponse>(),
      ["lastModifiedDate"],
      "Last modified date",
    );
    return lastModifiedDate;
  }

  async forceChanges(): Promise<void> {
    (await this.#httpClient.post(`${CHANGES_PATH}/force`)).expectOk();
  }
}
