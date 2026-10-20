import type { HttpClient } from "../../http/http-client";
import type { ModuleDescriptor } from "../types/modules";
import type {
  AppDescriptor,
  ChangeLogSearchCriteria,
  LastModifiedResponse,
  OperationLog,
  PushNotificationPage,
  PushNotificationSearchCriteria,
  SystemInfo,
} from "../types/platform";

import { requireFields } from "@core/required-fields";

import { MODULE_DESCRIPTOR } from "../types/modules";
import { APP_DESCRIPTOR, OPERATION_LOG, PUSH_NOTIFICATION_PAGE, SYSTEM_INFO } from "../types/platform";
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
    return response.records(APP_DESCRIPTOR);
  }
}

class ChangeLogResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async search(criteria: ChangeLogSearchCriteria): Promise<OperationLog[]> {
    const response = await this.#httpClient.post(CHANGE_LOG_SEARCH_PATH, { json: criteria });
    return response.results(OPERATION_LOG);
  }
}

class PushNotificationsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async search(criteria: PushNotificationSearchCriteria): Promise<PushNotificationPage> {
    const response = await this.#httpClient.post(PUSH_NOTIFICATIONS_PATH, { json: criteria });
    return response.record(PUSH_NOTIFICATION_PAGE);
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
    return response.record(SYSTEM_INFO);
  }

  async listModulesWithErrors(): Promise<ModuleDescriptor[]> {
    const response = await this.#httpClient.get(`${DIAGNOSTICS_PATH}/errors`);
    return response.records(MODULE_DESCRIPTOR);
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
