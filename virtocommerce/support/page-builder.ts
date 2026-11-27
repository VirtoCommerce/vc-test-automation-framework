import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

/** The saved content of a page builder page: its settings and its sections. */
export interface PageContent {
  readonly settings: { readonly header?: string };
  readonly content: readonly unknown[];
}

/**
 * Returns the saved content of a page builder page.
 *
 * @param api - A client signed in as a user who may read pages.
 * @param pageId - The identifier of the page group.
 * @returns The content.
 */
export async function pageContentOf(api: HttpClient, pageId: string): Promise<PageContent> {
  return (await api.get(`/api/page-builder-pages/grouped/${pageId}/content`)).expectOk().json<PageContent>();
}
