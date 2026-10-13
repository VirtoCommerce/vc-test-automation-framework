import type { KnownIssue } from "@dataset/known-issues";

import { expect, test } from "@playwright/test";

import { KNOWN_ISSUES } from "@dataset/known-issues";

const TRACKER_KEY = /^[A-Z][A-Z0-9]*-\d+$/;

test.describe("KNOWN_ISSUES", () => {
  for (const [name, { key, summary }] of Object.entries<KnownIssue>(KNOWN_ISSUES)) {
    test(`${name} has a summary and a well-formed tracker key, if any`, () => {
      expect(key ?? "NONE-0").toMatch(TRACKER_KEY);
      expect(summary.trim()).not.toBe("");
    });
  }
});
