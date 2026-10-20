import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type ContentItemData = Rest.VirtoCommerceContentModuleCoreModelContentItem;
export type ContentStatisticData = Rest.VirtoCommerceContentModuleCoreModelContentStatistic;
export type MenuLinkListData = Rest.VirtoCommerceContentModuleCoreModelMenuLinkList;

export const CONTENT_ITEM = shape<ContentItemData>()("Content item", ["name", "type", "url", "relativeUrl"]);
export type ContentItem = Shaped<typeof CONTENT_ITEM>;
export const CONTENT_STATISTIC = shape<ContentStatisticData>()("Content statistic", [
  "pagesCount",
  "blogsCount",
  "themesCount",
]);
export type ContentStatistic = Shaped<typeof CONTENT_STATISTIC>;
export const MENU_LINK_LIST = shape<MenuLinkListData>()("Menu link list", ["id", "name", "storeId", "language"]);
export type MenuLinkList = Shaped<typeof MENU_LINK_LIST>;

export type ContentType = "pages" | "blogs" | "themes";
