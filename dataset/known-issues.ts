interface KnownIssue {
  readonly tracker: string | undefined;
  readonly summary: string;
}

export const KNOWN_ISSUES = {
  pageStatusToast: {
    tracker: undefined,
    summary: "PageBuilderModule shows a toast only for Save; publish, unpublish and archive raise no vc-notification",
  },
  pageSearchSortWindow: {
    tracker: undefined,
    summary:
      "POST /api/page-builder-pages/search applies the keyword only to the sorted page window (default sort " +
      "modifiedDate:DESC, take 20), so search misses pages outside the newest 20",
  },
  duplicatePermalinkAccepted: {
    tracker: undefined,
    summary: "PageBuilderModule accepts a second page with an existing permalink in the same language without an error",
  },
  permalinkStoredVerbatim: {
    tracker: undefined,
    summary: "PageBuilderModule stores the permalink verbatim: it is neither sanitised nor rejected",
  },
  storeWithoutName: {
    tracker: undefined,
    summary: "Saving a store without a name returns 500 (database not-null violation) instead of a validation error",
  },
  verificationEmailNotSent: {
    tracker: undefined,
    summary:
      "sendVerificationEmail answers 200 but the platform sends no ConfirmationEmailNotification, " +
      "also with Stores.EmailVerificationEnabled on",
  },
  themeZipFixture: {
    tracker: undefined,
    summary: "Needs a theme .zip fixture with a known internal file (Katalon used qwetheme_test_x.zip)",
  },
} as const satisfies Readonly<Record<string, KnownIssue>>;

export function describeIssue({ tracker, summary }: KnownIssue): string {
  return `[${tracker ?? "no tracker key"}] ${summary}`;
}
