import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type CreateGroupedPageRequest = Rest.VirtoCommercePageBuilderModuleCoreModelsCreateGroupedPageRequest;
export type GroupedPageData = Rest.VirtoCommercePageBuilderModuleCoreModelsGroupedPageBuilderPage;
export type GroupedPageSearchResult = Rest.VirtoCommercePageBuilderModuleCoreModelsGroupedPageBuilderPageSearchResult;
export type PageSearchCriteria = Rest.VirtoCommercePageBuilderModuleCoreModelsPageBuilderPageSearchCriteria;

export const GROUPED_PAGE = shape<GroupedPageData>()("Grouped page", ["id", "name", "permalink"]);
export type GroupedPage = Shaped<typeof GROUPED_PAGE>;

export const PAGE_STATUSES = ["Draft", "Published", "Archived"] as const;

export type PageStatus = (typeof PAGE_STATUSES)[number];

/** Publication state of a page: `hasChanges` when a saved draft differs from what is published. */
export interface PagePublishStatus {
  readonly published: boolean;
  readonly hasChanges: boolean;
}
