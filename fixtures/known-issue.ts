import type { TestInfo } from "@playwright/test";
import type { KnownIssue } from "@dataset/known-issues";

import { test } from "@playwright/test";
import * as allure from "allure-js-commons";

import { Logger } from "@core/logger";
import { KNOWN_ISSUES, TRACKER_URL } from "@dataset/known-issues";

/** A tracked issue a test hit, with the errors it explains. */
export interface KnownIssueHit {
  readonly issue: KnownIssue & { readonly key: string };
  readonly errors: readonly string[];
}

/**
 * Marks the running test with a known issue; call it first in the test. With a key the test is an expected failure
 * (a pass is reported as a failure, so the mark can go); without one it is skipped as `fixme`.
 *
 * @example
 * await knownIssue(KNOWN_ISSUES.channelSearchIgnoresFilters);
 */
export async function knownIssue(issue: KnownIssue | undefined): Promise<void> {
  if (issue === undefined) {
    return;
  }
  const { key } = issue;
  if (key === undefined) {
    new Logger("known issue").warn(`skipped "${test.info().titlePath.slice(1).join(" › ")}": ${issue.summary}`);
    test.fixme(true, issue.summary);
    return;
  }
  await markKnownIssues(test.info(), [{ issue: { ...issue, key }, errors: [] }]);
}

/** The tracked issues whose `failure` matches every error; `undefined` when one is unexplained or there are none. */
export function issuesExplaining(errors: readonly string[]): readonly KnownIssueHit[] | undefined {
  const issues: readonly KnownIssue[] = Object.values(KNOWN_ISSUES);
  const hits = new Map<string, KnownIssueHit>();
  for (const error of errors) {
    const issue = issues.find((candidate) => candidate.key !== undefined && candidate.failure?.test(error));
    if (issue?.key === undefined) {
      return undefined;
    }
    hits.set(issue.key, {
      issue: { ...issue, key: issue.key },
      errors: [...(hits.get(issue.key)?.errors ?? []), error],
    });
  }
  return hits.size === 0 ? undefined : [...hits.values()];
}

/**
 * Marks the test as an expected failure of each issue: Allure link and `known issue` tag, a "Known issue <key>"
 * attachment with the errors, an annotation and a log warning. Works in the test and in fixture teardown.
 */
export async function markKnownIssues(testInfo: TestInfo, hits: readonly KnownIssueHit[]): Promise<void> {
  for (const { issue, errors } of hits) {
    const headline = `${issue.key}: ${issue.summary}`;
    const url = `${TRACKER_URL}${issue.key}`;
    await allure.issue(url, issue.key);
    testInfo.annotations.push({ type: "known issue", description: headline });
    await testInfo.attach(`Known issue ${issue.key}`, {
      body: [headline, url, ...errors.map((error) => `\n${error}`)].join("\n"),
      contentType: "text/plain",
    });
    new Logger("known issue").warn(`${headline} (${url}) in "${testInfo.titlePath.slice(1).join(" › ")}"`);
  }
  await allure.tag("known issue");
  testInfo.fail(true, hits.map(({ issue }) => `${issue.key}: ${issue.summary}`).join("; "));
}
