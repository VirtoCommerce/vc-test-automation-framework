import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type AppDescriptorData = Rest.VirtoCommercePlatformWebModelModularityAppDescriptor;
export type ChangeLogSearchCriteria = Rest.VirtoCommercePlatformCoreChangeLogChangeLogSearchCriteria;
export type ChangeLogSearchResult = Rest.VirtoCommercePlatformCoreChangeLogChangeLogSearchResult;
export type DynamicPropertyData = Rest.VirtoCommercePlatformCoreDynamicPropertiesDynamicProperty;
export type DynamicPropertySearchCriteria =
  Rest.VirtoCommercePlatformCoreDynamicPropertiesDynamicPropertySearchCriteria;
export type DynamicPropertySearchResult = Rest.VirtoCommercePlatformCoreDynamicPropertiesDynamicPropertySearchResult;
export type LastModifiedResponse = Rest.VirtoCommercePlatformWebModelLastModifiedResponse;
export type OperationLogData = Rest.VirtoCommercePlatformCoreChangeLogOperationLog;
export type PushNotificationSearchCriteria =
  Rest.VirtoCommercePlatformCorePushNotificationsPushNotificationSearchCriteria;
export type PushNotificationSearchResult = Rest.VirtoCommercePlatformCorePushNotificationsPushNotificationSearchResult;
export type SystemInfoData = Rest.VirtoCommercePlatformWebModelDiagnosticsSystemInfo;

export const APP_DESCRIPTOR = shape<AppDescriptorData>()("App descriptor", ["id", "title"]);
export type AppDescriptor = Shaped<typeof APP_DESCRIPTOR>;
export const DYNAMIC_PROPERTY = shape<DynamicPropertyData>()("Dynamic property", [
  "id",
  "name",
  "objectType",
  "valueType",
]);
export type DynamicProperty = Shaped<typeof DYNAMIC_PROPERTY>;
export const OPERATION_LOG = shape<OperationLogData>()("Operation log", ["objectType", "objectId", "operationType"]);
export type OperationLog = Shaped<typeof OPERATION_LOG>;
export const SYSTEM_INFO = shape<SystemInfoData>()("System info", ["platformVersion"]);
export type SystemInfo = Shaped<typeof SYSTEM_INFO>;

export const PUSH_NOTIFICATION_PAGE = shape<PushNotificationSearchResult>()("Push notification page", [
  "totalCount",
  "newCount",
  "notifyEvents",
]);
export type PushNotificationPage = Shaped<typeof PUSH_NOTIFICATION_PAGE>;
