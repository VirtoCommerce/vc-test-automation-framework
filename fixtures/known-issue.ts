import type { KnownIssue } from "@dataset/known-issues";

import { test } from "@playwright/test";
import * as allure from "allure-js-commons";

import { Logger } from "@core/logger";
import { TRACKER_URL } from "@dataset/known-issues";

/**
 * Marks the running test with a known issue. Call it first in the test body.
 * - With a tracker key, the test runs and is expected to fail, linked to the ticket. Once the defect is fixed the
 *   test passes, Playwright reports that as a failure, and the mark (and its `KNOWN_ISSUES` entry) should go.
 * - Without a key, the test is skipped as `fixme`, with the summary as the reason; the console shows it too.
 * - `undefined` does nothing, so a table row can carry `issue: undefined` for its cases that work.
 *
 * @example
 * await knownIssue(KNOWN_ISSUES.channelSearchIgnoresFilters);
 */
export async function knownIssue(issue: KnownIssue | undefined): Promise<void> {
  if (issue === undefined) {
    return;
  }
  if (issue.key === undefined) {
    new Logger("known issue").warn(`skipped "${test.info().titlePath.slice(1).join(" › ")}": ${issue.summary}`);
    test.fixme(true, issue.summary);
    return;
  }
  await allure.issue(issue.key, `${TRACKER_URL}${issue.key}`);
  test.fail(true, `${issue.key}: ${issue.summary}`);
}
