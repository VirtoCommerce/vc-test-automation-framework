import type { WithRequired } from "@core/required-fields";
import type {
  VirtoCommercePageBuilderModuleCoreModelsCreateGroupedPageRequest as CreateGroupedPageRequest,
  VirtoCommercePageBuilderModuleCoreModelsGroupedPageBuilderPage as GroupedPageData,
  VirtoCommercePageBuilderModuleCoreModelsGroupedPageBuilderPageSearchResult as GroupedPageSearchResult,
  VirtoCommercePageBuilderModuleCoreModelsPageBuilderPageSearchCriteria as PageSearchCriteria,
} from "../generated/rest-api";

export type { CreateGroupedPageRequest, GroupedPageData, GroupedPageSearchResult, PageSearchCriteria };

export const GROUPED_PAGE_FIELDS = ["id", "name", "permalink"] as const;

export const PAGE_STATUSES = ["Draft", "Published", "Archived"] as const;

export type PageStatus = (typeof PAGE_STATUSES)[number];

/** Publication state of a page: `hasChanges` when a saved draft differs from what is published. */
export interface PagePublishStatus {
  readonly published: boolean;
  readonly hasChanges: boolean;
}

export type GroupedPage = WithRequired<GroupedPageData, (typeof GROUPED_PAGE_FIELDS)[number]>;

/**
 * What publishing a page does to another published page with its permalink: `Certain` when the page replaces it for
 * all its visitors and dates, `Possible` when they meet for some visitors or dates only, `None` when the frontend
 * tells them apart.
 */
export type PermalinkConflict = "None" | "Possible" | "Certain";

/** Another page of the store with the same permalink, as `POST grouped/permalink-usages` lists it. */
export interface PermalinkUsageData {
  readonly groupId?: string | null;
  readonly name?: string | null;
  readonly permalink?: string | null;
  readonly status?: PageStatus | null;
  readonly conflict?: PermalinkConflict;
  readonly canUnpublish?: boolean;
}

export const PERMALINK_USAGE_FIELDS = ["groupId", "conflict"] as const;

export type PermalinkUsage = WithRequired<PermalinkUsageData, (typeof PERMALINK_USAGE_FIELDS)[number]>;
