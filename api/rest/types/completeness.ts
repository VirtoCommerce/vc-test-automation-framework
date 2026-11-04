import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type CompletenessChannelData = Rest.VirtoCommerceCatalogPublishingModuleCoreModelCompletenessChannel;
export type CompletenessChannelSearchCriteria =
  Rest.VirtoCommerceCatalogPublishingModuleCoreModelSearchCompletenessChannelSearchCriteria;
export type CompletenessChannelSearchResult =
  Rest.VirtoCommerceCatalogPublishingModuleCoreModelSearchCompletenessChannelSearchResult;
export type CompletenessEntryData = Rest.VirtoCommerceCatalogPublishingModuleCoreModelCompletenessEntry;
export type EvaluateCompletenessNotificationData =
  Rest.VirtoCommerceCatalogPublishingModuleWebModelEvaluateCompletenessNotification;

export const COMPLETENESS_CHANNEL = shape<CompletenessChannelData>()("Completeness channel", [
  "id",
  "name",
  "catalogId",
]);
export type CompletenessChannel = Shaped<typeof COMPLETENESS_CHANNEL>;
export const COMPLETENESS_ENTRY = shape<CompletenessEntryData>()("Completeness entry", [
  "channelId",
  "productId",
  "completenessPercent",
]);
export type CompletenessEntry = Shaped<typeof COMPLETENESS_ENTRY>;

export const EVALUATE_COMPLETENESS_NOTIFICATION = shape<EvaluateCompletenessNotificationData>()(
  "Evaluate completeness notification",
  ["id"],
);
export type EvaluateCompletenessNotification = Shaped<typeof EVALUATE_COMPLETENESS_NOTIFICATION>;
