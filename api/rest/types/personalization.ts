import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type OutlineSyncNotificationData =
  Rest.VirtoCommerceCatalogPersonalizationModuleCoreModelTaggedItemOutlineSyncPushNotification;
export type TaggedItemData = Rest.VirtoCommerceCatalogPersonalizationModuleCoreModelTaggedItem;
export type TaggedItemSearchCriteria =
  Rest.VirtoCommerceCatalogPersonalizationModuleCoreModelSearchTaggedItemSearchCriteria;
export type TaggedItemSearchResult =
  Rest.VirtoCommerceCatalogPersonalizationModuleCoreModelSearchTaggedItemSearchResult;

export const TAGGED_ITEM = shape<TaggedItemData>()("Tagged item", ["entityId", "tags"]);
export type TaggedItem = Shaped<typeof TAGGED_ITEM>;

export const OUTLINE_SYNC_NOTIFICATION = shape<OutlineSyncNotificationData>()("Outline sync notification", ["id"]);
export type OutlineSyncNotification = Shaped<typeof OUTLINE_SYNC_NOTIFICATION>;

type TaggedEntityType = "Product" | "Category";

export interface TaggedEntity {
  readonly entityId: string;
  readonly entityType: TaggedEntityType;
  readonly label: string;
}
