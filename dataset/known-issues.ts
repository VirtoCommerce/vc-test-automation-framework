/** A platform or frontend defect that a test documents. */
export interface KnownIssue {
  /**
   * Tracker key, such as `VCST-5317`. With a key the test runs and is expected to fail; without one it is skipped
   * as `fixme` until a ticket exists.
   */
  readonly key?: string;
  /** What is wrong, in one sentence, as the report shows it. */
  readonly summary: string;
}

/** Tracker base URL; a known issue's link is this plus its key. */
export const TRACKER_URL = "https://virtocommerce.atlassian.net/browse/";

/**
 * Every known issue a test is marked with, by name. Add the tracker key once the ticket exists; remove the entry,
 * and its `knownIssue` calls, once the defect is fixed.
 */
export const KNOWN_ISSUES = {
  channelSearchIgnoresFilters: {
    summary:
      "POST /api/completeness/channels/search ignores objectIds and keyword and returns every completeness channel",
  },
  contentStatisticNotCounted: {
    summary: "GET /api/content/{storeId}/stats returns -1 for pagesCount, blogsCount and themesCount",
  },
  oauthAppSearchIgnoresFilters: {
    summary: "GET /api/platform/oauthapps ignores keyword and objectIds and returns every OAuth app",
  },
  permalinkStoredVerbatim: {
    summary:
      "The page builder stores permalinks as sent: whitespace and the characters & ? # are neither rejected nor removed",
  },
} as const satisfies Readonly<Record<string, KnownIssue>>;
