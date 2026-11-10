/** A platform or frontend defect that tests document. */
export interface KnownIssue {
  /** Tracker key, such as `VCST-5317`; without one, `knownIssue` skips the test as `fixme`. */
  readonly key?: string;
  /** One sentence, as the report shows it. */
  readonly summary: string;
  /** Error message the defect can cause in any test, such as a deadlock between parallel requests. */
  readonly failure?: RegExp;
}

/** Tracker base URL; a known issue's link is this plus its key. */
export const TRACKER_URL = "https://virtocommerce.atlassian.net/browse/";

/** Known issues by name. Add the tracker key once the ticket exists; remove the entry once the defect is fixed. */
export const KNOWN_ISSUES = {
  catalogDeleteDeadlock: {
    key: "VCST-6509",
    summary: "Concurrent deletes of unrelated catalogs deadlock on SQL Server; one delete fails with 500",
    failure: /DELETE \S+\/api\/catalog\/catalogs\/[^/?\s]+ → 500[\s\S]*deadlocked on lock resources/,
  },
  channelSearchIgnoresFilters: {
    key: "VCST-6441",
    summary:
      "POST /api/completeness/channels/search ignores objectIds and keyword and returns every completeness channel",
  },
  contentStatisticNotCounted: {
    key: "VCST-6444",
    summary: "GET /api/content/{storeId}/stats returns -1 for pagesCount, blogsCount and themesCount",
  },
  designerPreviewBlockedByEmbedderPolicy: {
    summary:
      "The page designer's preview is blocked (ERR_BLOCKED_BY_RESPONSE): the platform serves the designer with " +
      "Cross-Origin-Embedder-Policy: credentialless and the frontend's /designer-preview sends no such header",
  },
  duplicatePermalinkAccepted: {
    key: "VCST-6442",
    summary: "The page builder accepts a second page whose permalink already exists in the same store and language",
  },
  memberDeleteDeadlock: {
    key: "VCST-6510",
    summary:
      "Concurrent deletes of unrelated contacts and organizations deadlock on SQL Server; one delete fails with 500",
    failure:
      /DELETE \S+\/api\/(contacts|organizations|members)\?\S* → 500[\s\S]*An error occurred while saving the entity changes/,
  },
  oauthAppSearchIgnoresFilters: {
    key: "VCST-6440",
    summary: "POST /api/platform/oauthapps/search ignores keyword and objectIds and returns every OAuth app",
  },
} as const satisfies Readonly<Record<string, KnownIssue>>;
