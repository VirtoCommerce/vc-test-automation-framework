import type { KnownIssue } from "@dataset/known-issues";

import { expect, test } from "@playwright/test";

import { KNOWN_ISSUES } from "@dataset/known-issues";

const TRACKER_KEY = /^[A-Z][A-Z0-9]*-\d+$/;
const EF_SAVE_FAILURE =
  '{"message":"An error occurred while saving the entity changes. See the inner exception for details.","stackTrace":null}';
const DEADLOCK =
  '{"message":"Transaction (Process ID 71) was deadlocked on lock resources with another process and has been chosen as the deadlock victim. Rerun the transaction.","stackTrace":null}';

function failedUndo(request: string, body: string): string {
  return `${request} → 500 Internal Server Error\n${body}`;
}

test.describe("KNOWN_ISSUES", () => {
  for (const [name, { key, summary, failure }] of Object.entries<KnownIssue>(KNOWN_ISSUES)) {
    test(`${name} has a summary and a well-formed tracker key, if any`, () => {
      expect(key ?? "NONE-0").toMatch(TRACKER_KEY);
      expect(summary.trim()).not.toBe("");
      expect(failure === undefined || key !== undefined).toBe(true);
    });
  }
});

test.describe("failure patterns", () => {
  const MEMBER = KNOWN_ISSUES.memberDeleteDeadlock.failure;
  const CATALOG = KNOWN_ISSUES.catalogDeleteDeadlock.failure;
  const HOST = "http://localhost:8090";
  const CASES = [
    {
      title: "member: a contact delete with EF's save failure",
      pattern: MEMBER,
      matches: true,
      message: failedUndo(`DELETE ${HOST}/api/contacts?ids=9dd4`, EF_SAVE_FAILURE),
    },
    {
      title: "member: an organization delete with EF's save failure",
      pattern: MEMBER,
      matches: true,
      message: failedUndo(`DELETE ${HOST}/api/organizations?ids=52f5`, EF_SAVE_FAILURE),
    },
    {
      title: "member: a member delete with EF's save failure",
      pattern: MEMBER,
      matches: true,
      message: failedUndo(`DELETE ${HOST}/api/members?ids=bed6`, EF_SAVE_FAILURE),
    },
    {
      title: "member: not a contact create",
      pattern: MEMBER,
      matches: false,
      message: failedUndo(`POST ${HOST}/api/contacts`, EF_SAVE_FAILURE),
    },
    {
      title: "member: not another body",
      pattern: MEMBER,
      matches: false,
      message: failedUndo(`DELETE ${HOST}/api/contacts?ids=9dd4`, DEADLOCK),
    },
    {
      title: "member: not another status",
      pattern: MEMBER,
      matches: false,
      message: `DELETE ${HOST}/api/contacts?ids=9dd4 → 404 Not Found`,
    },
    {
      title: "catalog: a catalog delete chosen as the deadlock victim",
      pattern: CATALOG,
      matches: true,
      message: failedUndo(`DELETE ${HOST}/api/catalog/catalogs/bcb2`, DEADLOCK),
    },
    {
      title: "catalog: not another body",
      pattern: CATALOG,
      matches: false,
      message: failedUndo(`DELETE ${HOST}/api/catalog/catalogs/bcb2`, EF_SAVE_FAILURE),
    },
    {
      title: "catalog: not a product delete",
      pattern: CATALOG,
      matches: false,
      message: failedUndo(`DELETE ${HOST}/api/catalog/products?ids=1`, DEADLOCK),
    },
  ] as const;
  for (const { title, pattern, matches, message } of CASES) {
    test(title, () => {
      expect(pattern.test(message)).toBe(matches);
    });
  }
});
