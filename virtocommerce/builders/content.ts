import type { VirtoCommerceContentModuleCoreModelMenuLinkList as MenuLinkList } from "../rest/generated/platform.ts";

import { randomUUID } from "node:crypto";

import { uniqueId } from "../support/unique-id.ts";

/** A menu link list to save, with its name, store, language and links. */
export type MenuLinkListDraft = MenuLinkList & {
  readonly id: string;
  readonly name: string;
  readonly menuLinks: readonly { readonly priority: number; readonly title: string; readonly url: string }[];
};

/**
 * Returns a new menu link list with two links.
 *
 * @param storeId - The store of the list.
 * @param language - The language of the list.
 * @returns The list, with a unique name.
 */
export function newMenuLinkList(storeId: string, language: string): MenuLinkListDraft {
  return {
    id: randomUUID(),
    name: uniqueId("test-menu"),
    storeId,
    language,
    menuLinks: [
      { priority: 10, title: "About us", url: "~/pages/about_us" },
      { priority: 0, title: "Pages", url: "~/pages" },
    ],
  };
}

/** A type of content of a store. */
export type ContentType = "pages" | "blogs" | "themes";

/**
 * Returns the path of the content of a type in a store, which lists, uploads and deletes its items.
 *
 * @param contentType - The type of content.
 * @param storeId - The store.
 * @returns The path.
 */
export function contentPath(contentType: ContentType, storeId: string): string {
  return `/api/content/${contentType}/${encodeURIComponent(storeId)}`;
}
