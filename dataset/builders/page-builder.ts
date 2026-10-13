import type { CreateGroupedPageRequest } from "@api/rest/types/page-builder";
import type { WithRequired } from "@core/required-fields";

import { uniqueId } from "@core/unique-id";

/** Starts the name of every page a test creates, so cleanup and searches find them. */
export const TEST_PAGE_PREFIX = "test-page";

/** A page builder page to create. */
export type PageDraft = WithRequired<CreateGroupedPageRequest, "storeId" | "name" | "permalink" | "cultureName">;

/**
 * Builds a visible page with permalink `/<name>` and one text block per text.
 *
 * @param options.name - Unique `test-page-…` by default.
 * @param options.permalink - `/<name>` by default.
 */
export function newPage(
  storeId: string,
  cultureName: string,
  options: { readonly name?: string; readonly permalink?: string; readonly texts?: readonly string[] } = {},
): PageDraft {
  const name = options.name ?? uniqueId(TEST_PAGE_PREFIX);
  const permalink = options.permalink ?? `/${name}`;
  return {
    storeId,
    name,
    permalink,
    cultureName,
    visibility: true,
    content: JSON.stringify({
      settings: { cultureName, header: name, name, permalink, seoInfo: { pageTitle: name } },
      content: (options.texts ?? []).map((text, index) => ({
        id: `text-${index}`,
        heading: "h2",
        type: "text",
        text: { html: `<p>${text}</p>\n`, markdown: text },
      })),
    }),
  };
}
