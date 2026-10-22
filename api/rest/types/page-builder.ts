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

export const PERMALINK_CONFLICTS = ["None", "Possible", "Certain"] as const;

/**
 * What publishing a page does to another published page with its permalink: `Certain` when the frontend offers
 * both to the same visitors, `Possible` when only a visitor in both pages' user groups gets both.
 */
export type PermalinkConflict = (typeof PERMALINK_CONFLICTS)[number];

/** Another page of the store with the same permalink, as `POST grouped/permalink-usages` lists it. */
export interface PermalinkUsage {
  readonly groupId: string;
  readonly name: string;
  readonly permalink: string;
  readonly status: string;
  readonly conflict: PermalinkConflict;
  readonly canUnpublish: boolean;
}
