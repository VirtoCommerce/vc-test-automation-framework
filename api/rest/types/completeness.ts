import type { WithRequired } from "@core/required-fields";
import type {
  VirtoCommerceCatalogPublishingModuleCoreModelCompletenessChannel as CompletenessChannelData,
  VirtoCommerceCatalogPublishingModuleCoreModelSearchCompletenessChannelSearchCriteria as CompletenessChannelSearchCriteria,
  VirtoCommerceCatalogPublishingModuleCoreModelSearchCompletenessChannelSearchResult as CompletenessChannelSearchResult,
  VirtoCommerceCatalogPublishingModuleCoreModelCompletenessEntry as CompletenessEntryData,
  VirtoCommerceCatalogPublishingModuleWebModelEvaluateCompletenessNotification as EvaluateCompletenessNotificationData,
} from "../generated/rest-api";

export type {
  CompletenessChannelData,
  CompletenessChannelSearchCriteria,
  CompletenessChannelSearchResult,
  CompletenessEntryData,
  EvaluateCompletenessNotificationData,
};

export const COMPLETENESS_CHANNEL_FIELDS = ["id", "name", "catalogId"] as const;
export const COMPLETENESS_ENTRY_FIELDS = ["channelId", "productId", "completenessPercent"] as const;
export const EVALUATE_COMPLETENESS_NOTIFICATION_FIELDS = ["id"] as const;

export type CompletenessChannel = WithRequired<CompletenessChannelData, (typeof COMPLETENESS_CHANNEL_FIELDS)[number]>;
export type CompletenessEntry = WithRequired<CompletenessEntryData, (typeof COMPLETENESS_ENTRY_FIELDS)[number]>;
export type EvaluateCompletenessNotification = WithRequired<
  EvaluateCompletenessNotificationData,
  (typeof EVALUATE_COMPLETENESS_NOTIFICATION_FIELDS)[number]
>;
