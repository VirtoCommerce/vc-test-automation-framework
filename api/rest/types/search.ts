import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type IndexingOptions = Rest.VirtoCommerceSearchModuleCoreModelIndexingOptions;
export type IndexProgressNotificationData = Rest.VirtoCommerceSearchModuleCoreModelIndexProgressPushNotification;
export type IndexStateData = Rest.VirtoCommerceSearchModuleCoreModelIndexState;

export const INDEX_STATE = shape<IndexStateData>()("Index state", ["provider", "scope", "documentType"]);
export type IndexState = Shaped<typeof INDEX_STATE>;

export const INDEX_PROGRESS_NOTIFICATION = shape<IndexProgressNotificationData>()("Index progress notification", [
  "id",
  "jobId",
]);
export type IndexProgressNotification = Shaped<typeof INDEX_PROGRESS_NOTIFICATION>;

export type IndexedDocument = Readonly<Record<string, unknown>>;
