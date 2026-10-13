import type { WithRequired } from "@core/required-fields";
import type {
  VirtoCommercePlatformWebModelModularityAppDescriptor as AppDescriptorData,
  VirtoCommercePlatformCoreChangeLogChangeLogSearchCriteria as ChangeLogSearchCriteria,
  VirtoCommercePlatformCoreChangeLogChangeLogSearchResult as ChangeLogSearchResult,
  VirtoCommercePlatformCoreDynamicPropertiesDynamicProperty as DynamicPropertyData,
  VirtoCommercePlatformCoreDynamicPropertiesDynamicPropertySearchCriteria as DynamicPropertySearchCriteria,
  VirtoCommercePlatformCoreDynamicPropertiesDynamicPropertySearchResult as DynamicPropertySearchResult,
  VirtoCommercePlatformWebModelLastModifiedResponse as LastModifiedResponse,
  VirtoCommercePlatformCoreChangeLogOperationLog as OperationLogData,
  VirtoCommercePlatformCorePushNotificationsPushNotificationSearchCriteria as PushNotificationSearchCriteria,
  VirtoCommercePlatformCorePushNotificationsPushNotificationSearchResult as PushNotificationSearchResult,
  VirtoCommercePlatformWebModelDiagnosticsSystemInfo as SystemInfoData,
} from "../generated/rest-api";

export type {
  AppDescriptorData,
  ChangeLogSearchCriteria,
  ChangeLogSearchResult,
  DynamicPropertyData,
  DynamicPropertySearchCriteria,
  DynamicPropertySearchResult,
  LastModifiedResponse,
  OperationLogData,
  PushNotificationSearchCriteria,
  PushNotificationSearchResult,
  SystemInfoData,
};

export const APP_DESCRIPTOR_FIELDS = ["id", "title"] as const;
export const DYNAMIC_PROPERTY_FIELDS = ["id", "name", "objectType", "valueType"] as const;

export type AppDescriptor = WithRequired<AppDescriptorData, (typeof APP_DESCRIPTOR_FIELDS)[number]>;
export type DynamicProperty = WithRequired<DynamicPropertyData, (typeof DYNAMIC_PROPERTY_FIELDS)[number]>;

export const OPERATION_LOG_FIELDS = ["objectType", "objectId", "operationType"] as const;
export const SYSTEM_INFO_FIELDS = ["platformVersion"] as const;
export const PUSH_NOTIFICATION_PAGE_FIELDS = ["totalCount", "newCount", "notifyEvents"] as const;

export type OperationLog = WithRequired<OperationLogData, (typeof OPERATION_LOG_FIELDS)[number]>;
export type SystemInfo = WithRequired<SystemInfoData, (typeof SYSTEM_INFO_FIELDS)[number]>;
export type PushNotificationPage = WithRequired<
  PushNotificationSearchResult,
  (typeof PUSH_NOTIFICATION_PAGE_FIELDS)[number]
>;
