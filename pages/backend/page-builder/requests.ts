import type { Response } from "@playwright/test";

const SEARCH_PATH = "/api/page-builder-pages/search";
const SAVE_PATH = "/api/page-builder-pages/grouped";
const PUBLISHING_PATH = "/api/page-builder-pages/grouped/publishing/";

/**
 * Whether a response answers the page search (`POST /api/page-builder-pages/search`).
 * @param keyword - Required search keyword (`""` matches a search without one); omit to match any search.
 */
export function isPagesSearch(response: Response, keyword?: string): boolean {
  if (response.request().method() !== "POST" || new URL(response.url()).pathname !== SEARCH_PATH) {
    return false;
  }
  const criteria: unknown = response.request().postDataJSON();
  const searched = typeof criteria === "object" && criteria !== null ? Reflect.get(criteria, "keyword") : undefined;
  return keyword === undefined || (searched ?? "") === keyword;
}

/** Whether a response answers a page save (POST or PUT), whatever its status. */
export function isPageSave(response: Response): boolean {
  return (
    ["POST", "PUT"].includes(response.request().method()) && new URL(response.url()).pathname.startsWith(SAVE_PATH)
  );
}

/** Whether a response is a successful publish or unpublish of a page. */
export function isPagePublishing(response: Response): boolean {
  return new URL(response.url()).pathname.startsWith(PUBLISHING_PATH) && response.ok();
}
