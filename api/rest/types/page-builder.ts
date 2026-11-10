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

/** A section of a page's content: its id, its block type and the block's own fields. */
export interface PageSection {
  readonly id: string;
  readonly type: string;
  readonly [field: string]: unknown;
}

/** A page's content as the designer saves it: the page settings and the sections in order. */
export interface PageContent {
  readonly settings: {
    readonly header?: string;
    readonly name?: string;
    readonly permalink?: string;
    readonly seoInfo?: {
      readonly pageTitle?: string;
      readonly metaKeywords?: string;
      readonly metaDescription?: string;
    };
  };
  readonly content: readonly PageSection[];
}

/** Publication state of a page: `hasChanges` when a saved draft differs from what is published. */
export interface PagePublishStatus {
  readonly published: boolean;
  readonly hasChanges: boolean;
}
