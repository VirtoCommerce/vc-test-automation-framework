import type { TestInfo } from "@playwright/test";
import type { output } from "zod";

import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import { test } from "@playwright/test";
import * as allure from "allure-js-commons";
import { array, record, strictObject, string } from "zod";

import { Logger } from "@core/logger";
import { nonEmptyString, parseOrThrow, webUrl } from "@core/validation";

/** `known-issues.json` in the repository root; a partner's CI puts its own file there in place of ours. */
export const KNOWN_ISSUES_FILE = resolve(__dirname, "..", "known-issues.json");

/** Names of the known issues the framework's specs and unit tests use; the committed file lists each of them. */
export const KNOWN_ISSUE_NAMES = [
  "catalogDeleteDeadlock",
  "channelSearchIgnoresFilters",
  "contentStatisticNotCounted",
  "duplicatePermalinkAccepted",
  "memberDeleteDeadlock",
  "oauthAppSearchIgnoresFilters",
] as const;

export type KnownIssueName = (typeof KNOWN_ISSUE_NAMES)[number];

const pattern = nonEmptyString
  .refine(isRegExp, "must be a valid regular expression")
  .transform((source) => new RegExp(source));

const IssueSchema = strictObject({
  issueUrl: webUrl.optional(),
  summary: nonEmptyString,
  failure: pattern.optional(),
  tests: array(nonEmptyString).optional(),
}).refine(
  (issue) => issue.issueUrl !== undefined || issue.failure === undefined,
  "an issue with a failure pattern needs an issueUrl",
);

const FileSchema = record(string(), IssueSchema);

/**
 * A platform or frontend defect that tests document, from the known issues file. With an `issueUrl` a marked test
 * is an expected failure linked to it; without one the test is skipped as `fixme`. `failure` marks any test whose
 * errors all match it; `tests` marks the tests it names.
 */
export type KnownIssue = Readonly<output<typeof IssueSchema>> & { readonly name: string };

/** A tracked issue a test hit, with the errors it explains. */
export interface KnownIssueHit {
  readonly issue: KnownIssue & { readonly issueUrl: string };
  readonly errors: readonly string[];
}

/**
 * Parses a known issues file's content: issues by name, each with an optional `issueUrl`, a `summary`, an optional
 * `failure` regular expression and optional `tests` patterns.
 *
 * @throws Error naming every invalid entry, unknown fields included.
 */
export function parseKnownIssues(content: unknown, label: string): readonly KnownIssue[] {
  return Object.entries(parseOrThrow(FileSchema, content, label)).map(([name, issue]) => ({ name, ...issue }));
}

/** Every issue of the known issues file, the partner's own included. */
export const ALL_KNOWN_ISSUES: readonly KnownIssue[] = loadKnownIssues(KNOWN_ISSUES_FILE);

/**
 * The issues the framework's specs mark, by name. A name the file does not list is `undefined`, and marking a test
 * with it does nothing: the test runs as usual.
 *
 * @example
 * await knownIssue(KNOWN_ISSUES.channelSearchIgnoresFilters);
 */
export const KNOWN_ISSUES: Readonly<Partial<Record<KnownIssueName, KnownIssue>>> = Object.fromEntries(
  ALL_KNOWN_ISSUES.map((issue) => [issue.name, issue]),
);

/** The label reports show for an issue link: the URL's last path segment, such as `VCST-6509`. */
export function issueLabel(issueUrl: string): string {
  return new URL(issueUrl).pathname.split("/").filter(Boolean).at(-1) ?? issueUrl;
}

/**
 * A test as `tests` patterns see it: its file relative to the repository root, then its titles, joined by ` › `,
 * such as `tests/restapi/security/oauth-apps.spec.ts › oauth apps (store administrator) › search by keyword`.
 */
export function testIdOf(testInfo: Pick<TestInfo, "file" | "titlePath" | "config">): string {
  const file = relative(testInfo.config.rootDir, testInfo.file).split(sep).join("/");
  return [file, ...testInfo.titlePath.slice(1)].join(" › ");
}

/** The issues with a `tests` pattern that matches the whole test id; `*` matches any text. */
export function issuesForTest(issues: readonly KnownIssue[], testId: string): readonly KnownIssue[] {
  return issues.filter((issue) => issue.tests?.some((candidate) => wildcard(candidate).test(testId)) === true);
}

/**
 * Marks the running test with a known issue; call it first in the test. With an `issueUrl` the test is an expected
 * failure (a pass is reported as a failure, so the mark can go); without one it is skipped as `fixme`. An issue the
 * known issues file does not list (`undefined`) changes nothing.
 *
 * @example
 * await knownIssue(KNOWN_ISSUES.channelSearchIgnoresFilters);
 */
export async function knownIssue(issue: KnownIssue | undefined): Promise<void> {
  if (issue !== undefined) {
    await markWithIssue(test.info(), issue);
  }
}

/** Marks a test with every issue whose `tests` patterns name it, before the test runs; see {@link knownIssue}. */
export async function markListedTest(testInfo: TestInfo, issues: readonly KnownIssue[] = ALL_KNOWN_ISSUES) {
  for (const issue of issuesForTest(issues, testIdOf(testInfo))) {
    await markWithIssue(testInfo, issue);
  }
}

/** The tracked issues whose `failure` matches every error; `undefined` when one is unexplained or there are none. */
export function issuesExplaining(
  errors: readonly string[],
  issues: readonly KnownIssue[] = ALL_KNOWN_ISSUES,
): readonly KnownIssueHit[] | undefined {
  const hits = new Map<string, KnownIssueHit>();
  for (const error of errors) {
    const issue = issues.find((candidate) => candidate.issueUrl !== undefined && candidate.failure?.test(error));
    if (issue?.issueUrl === undefined) {
      return undefined;
    }
    hits.set(issue.name, {
      issue: { ...issue, issueUrl: issue.issueUrl },
      errors: [...(hits.get(issue.name)?.errors ?? []), error],
    });
  }
  return hits.size === 0 ? undefined : [...hits.values()];
}

/**
 * Marks the test as an expected failure of each issue: Allure link and `known issue` tag, a "Known issue <label>"
 * attachment with the errors, an annotation and a log warning. Works in the test and in fixture teardown.
 */
export async function markKnownIssues(testInfo: TestInfo, hits: readonly KnownIssueHit[]): Promise<void> {
  for (const { issue, errors } of hits) {
    const label = issueLabel(issue.issueUrl);
    const headline = `${label}: ${issue.summary}`;
    await allure.issue(issue.issueUrl, label);
    testInfo.annotations.push({ type: "known issue", description: headline });
    await testInfo.attach(`Known issue ${label}`, {
      body: [headline, issue.issueUrl, ...errors.map((error) => `\n${error}`)].join("\n"),
      contentType: "text/plain",
    });
    new Logger("known issue").warn(`${headline} (${issue.issueUrl}) in "${testInfo.titlePath.slice(1).join(" › ")}"`);
  }
  await allure.tag("known issue");
  testInfo.fail(true, hits.map(({ issue }) => `${issueLabel(issue.issueUrl)}: ${issue.summary}`).join("; "));
}

async function markWithIssue(testInfo: TestInfo, issue: KnownIssue): Promise<void> {
  const { issueUrl } = issue;
  if (issueUrl === undefined) {
    new Logger("known issue").warn(`skipped "${testInfo.titlePath.slice(1).join(" › ")}": ${issue.summary}`);
    testInfo.fixme(true, issue.summary);
    return;
  }
  await markKnownIssues(testInfo, [{ issue: { ...issue, issueUrl }, errors: [] }]);
}

function loadKnownIssues(path: string): readonly KnownIssue[] {
  let content: unknown;
  try {
    content = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read the known issues file ${path}: ${String(error)}`);
  }
  return parseKnownIssues(content, `Invalid known issues file ${path}`);
}

function isRegExp(source: string): boolean {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}

function wildcard(testPattern: string): RegExp {
  const escaped = testPattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${escaped.join(".*")}$`);
}
