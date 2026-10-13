import type { MenuLinkListData } from "@api/rest/types/content";
import type { WithRequired } from "@core/required-fields";

import { randomUUID } from "node:crypto";

import { uniqueId } from "@core/unique-id";

/** A menu link list to create, with its id chosen up front. */
export type MenuLinkListDraft = WithRequired<MenuLinkListData, "id" | "name" | "storeId" | "language" | "menuLinks">;

/**
 * Builds a menu link list named `test-menu-…` with a random id and two links ("About us", "Pages").
 *
 * @param language - Such as `en-US`.
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
