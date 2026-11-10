import type { Response } from "@playwright/test";

const GROUPED_PAGES_PATH = "/api/page-builder-pages/grouped/";

/** Whether a response answers the designer's save of a page's content (`POST …/grouped/{id}/content`). */
export function isDesignerSave(response: Response): boolean {
  const { pathname } = new URL(response.url());
  return (
    response.request().method() === "POST" && pathname.startsWith(GROUPED_PAGES_PATH) && pathname.endsWith("/content")
  );
}
