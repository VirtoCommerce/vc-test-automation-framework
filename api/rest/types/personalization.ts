import type { WithRequired } from "@core/required-fields";
import type {
  VirtoCommerceCatalogPersonalizationModuleCoreModelTaggedItemOutlineSyncPushNotification as OutlineSyncNotificationData,
  VirtoCommerceCatalogPersonalizationModuleCoreModelTaggedItem as TaggedItemData,
  VirtoCommerceCatalogPersonalizationModuleCoreModelSearchTaggedItemSearchCriteria as TaggedItemSearchCriteria,
  VirtoCommerceCatalogPersonalizationModuleCoreModelSearchTaggedItemSearchResult as TaggedItemSearchResult,
} from "../generated/rest-api";

export type { OutlineSyncNotificationData, TaggedItemData, TaggedItemSearchCriteria, TaggedItemSearchResult };

export const TAGGED_ITEM_FIELDS = ["entityId", "tags"] as const;
export const OUTLINE_SYNC_NOTIFICATION_FIELDS = ["id"] as const;

export type TaggedItem = WithRequired<TaggedItemData, (typeof TAGGED_ITEM_FIELDS)[number]>;
export type OutlineSyncNotification = WithRequired<
  OutlineSyncNotificationData,
  (typeof OUTLINE_SYNC_NOTIFICATION_FIELDS)[number]
>;

type TaggedEntityType = "Product" | "Category";

export interface TaggedEntity {
  readonly entityId: string;
  readonly entityType: TaggedEntityType;
  readonly label: string;
}
