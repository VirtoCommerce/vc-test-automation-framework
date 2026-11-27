import type { VirtoCommercePageBuilderModuleCoreModelsCreateGroupedPageRequest as CreateGroupedPageRequest } from "../rest/generated/platform.ts";

import { uniqueId } from "../support/unique-id.ts";

/** The prefix of the names of the pages that tests create. */
export const TEST_PAGE_PREFIX = "test-page";

/**
 * Returns the identifier of a text section of a page from {@link newPage}.
 *
 * @param index - The position of the text in `texts`.
 * @returns The identifier of the section.
 */
export function textSectionId(index: number): string {
  return `text-${index}`;
}

/** The options of {@link newPage}. */
export interface PageOptions {
  /** A unique name by default. */
  readonly name?: string;
  /** `/<name>` by default. */
  readonly permalink?: string;
  /** The texts of the page, one text section each. */
  readonly texts?: readonly string[];
}

/** A page builder page to create, with its name and permalink. */
type PageDraft = CreateGroupedPageRequest & { readonly name: string; readonly permalink: string };

/**
 * Returns a new visible page builder page with a text section for each text.
 *
 * @param storeId - The store of the page.
 * @param cultureName - The language of the page.
 * @param options - The name, permalink and texts of the page.
 * @returns The page.
 */
export function newPage(storeId: string, cultureName: string, options: PageOptions = {}): PageDraft {
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
        id: textSectionId(index),
        heading: "h2",
        type: "text",
        text: { html: `<p>${text}</p>\n`, markdown: text },
      })),
    }),
  };
}
