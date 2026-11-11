import type { KnownIssueName } from "../../../fixtures/known-issue";

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  issueLabel,
  issuesExplaining,
  issuesForTest,
  KNOWN_ISSUE_NAMES,
  KNOWN_ISSUES,
  KNOWN_ISSUES_FILE,
  parseKnownIssues,
} from "../../../fixtures/known-issue";

const EF_SAVE_FAILURE =
  '{"message":"An error occurred while saving the entity changes. See the inner exception for details.","stackTrace":null}';
const DEADLOCK =
  '{"message":"Transaction (Process ID 71) was deadlocked on lock resources with another process and has been chosen as the deadlock victim. Rerun the transaction.","stackTrace":null}';
const HOST = "http://localhost:8090";
const CONTACT_DEADLOCK =
  "cleanup: delete contact Test Customer Cgjbgnng: DELETE http://localhost:8090/api/contacts?ids=9dd4e26a → 500 " +
  'Internal Server Error\n{"message":"An error occurred while saving the entity changes. See the inner exception."}';
const CATALOG_DEADLOCK_IN_TEST =
  "HttpError: DELETE http://localhost:8090/api/catalog/catalogs/bcb22f4b → 500 Internal Server Error\n" +
  '{"message":"Transaction (Process ID 71) was deadlocked on lock resources with another process."}';
const SPEC = "tests/restapi/security/oauth-apps.spec.ts";

function failedUndo(request: string, body: string): string {
  return `${request} → 500 Internal Server Error\n${body}`;
}

function failureOf(name: KnownIssueName): RegExp {
  const failure = KNOWN_ISSUES[name]?.failure;
  if (failure === undefined) {
    throw new Error(`${name} has no failure pattern`);
  }
  return failure;
}

test.describe("the committed known issues file", () => {
  test("lists exactly the issues the framework names", () => {
    const content: unknown = JSON.parse(readFileSync(KNOWN_ISSUES_FILE, "utf8"));
    expect(parseKnownIssues(content, "known-issues.json").map(({ name }) => name)).toEqual([...KNOWN_ISSUE_NAMES]);
  });

  for (const name of KNOWN_ISSUE_NAMES.filter((candidate) => KNOWN_ISSUES[candidate]?.issueUrl !== undefined)) {
    test(`${name} links its ticket by key`, () => {
      expect(KNOWN_ISSUES[name]?.issueUrl).toMatch(/^https:\/\/\S+\/[A-Z][A-Z0-9]*-\d+$/);
    });
  }
});

test.describe("parseKnownIssues", () => {
  const ISSUE = { issueUrl: "https://tracker.example.com/browse/ABC-1", summary: "Search ignores filters" };
  const INVALID = [
    { title: "a blank summary", issue: { ...ISSUE, summary: " " }, error: "must not be blank" },
    { title: "an issueUrl that is not a web URL", issue: { ...ISSUE, issueUrl: "ABC-1" }, error: "issueUrl" },
    { title: "an invalid failure pattern", issue: { ...ISSUE, failure: "(unclosed" }, error: "regular expression" },
    {
      title: "a failure pattern without an issueUrl",
      issue: { summary: "Deadlock", failure: "deadlock" },
      error: "needs an issueUrl",
    },
    { title: "an unknown field", issue: { ...ISSUE, key: "ABC-1" }, error: "key" },
  ];

  test("names each issue and compiles its failure pattern", () => {
    const [issue] = parseKnownIssues({ searchIgnoresFilters: { ...ISSUE, failure: "POST \\S+ → 500" } }, "file");

    expect(issue).toMatchObject({ name: "searchIgnoresFilters", ...ISSUE });
    expect(issue?.failure?.test("POST http://host/api/search → 500")).toBe(true);
  });

  for (const { title, issue, error } of INVALID) {
    test(`rejects ${title}`, () => {
      expect(() => parseKnownIssues({ broken: issue }, "Invalid file")).toThrow(error);
    });
  }
});

test.describe("issuesForTest", () => {
  const ISSUES = parseKnownIssues(
    {
      wholeFile: { summary: "Every OAuth app test", tests: [`${SPEC} › *`] },
      oneTest: { summary: "One test", tests: ["* › search by keyword"] },
      otherFile: { summary: "Other file", tests: ["tests/graphql/*"] },
    },
    "file",
  );

  test("matches whole test ids, with * for any text", () => {
    const names = issuesForTest(ISSUES, `${SPEC} › oauth apps (store administrator) › search by keyword`).map(
      ({ name }) => name,
    );

    expect(names).toEqual(["wholeFile", "oneTest"]);
  });

  test("takes other characters literally", () => {
    expect(issuesForTest(ISSUES, `${SPEC.replace(".spec", "xspec")} › search by keyword (2)`)).toEqual([]);
  });
});

test.describe("issueLabel", () => {
  test("is the URL's last path segment", () => {
    expect(issueLabel("https://virtocommerce.atlassian.net/browse/VCST-6509")).toBe("VCST-6509");
    expect(issueLabel("https://github.com/org/repo/issues/42/")).toBe("42");
  });
});

test.describe("failure patterns", () => {
  const CASES = [
    {
      title: "member: a contact delete with EF's save failure",
      issue: "memberDeleteDeadlock",
      matches: true,
      message: failedUndo(`DELETE ${HOST}/api/contacts?ids=9dd4`, EF_SAVE_FAILURE),
    },
    {
      title: "member: an organization delete with EF's save failure",
      issue: "memberDeleteDeadlock",
      matches: true,
      message: failedUndo(`DELETE ${HOST}/api/organizations?ids=52f5`, EF_SAVE_FAILURE),
    },
    {
      title: "member: a member delete with EF's save failure",
      issue: "memberDeleteDeadlock",
      matches: true,
      message: failedUndo(`DELETE ${HOST}/api/members?ids=bed6`, EF_SAVE_FAILURE),
    },
    {
      title: "member: not a contact create",
      issue: "memberDeleteDeadlock",
      matches: false,
      message: failedUndo(`POST ${HOST}/api/contacts`, EF_SAVE_FAILURE),
    },
    {
      title: "member: not another body",
      issue: "memberDeleteDeadlock",
      matches: false,
      message: failedUndo(`DELETE ${HOST}/api/contacts?ids=9dd4`, DEADLOCK),
    },
    {
      title: "member: not another status",
      issue: "memberDeleteDeadlock",
      matches: false,
      message: `DELETE ${HOST}/api/contacts?ids=9dd4 → 404 Not Found`,
    },
    {
      title: "catalog: a catalog delete chosen as the deadlock victim",
      issue: "catalogDeleteDeadlock",
      matches: true,
      message: failedUndo(`DELETE ${HOST}/api/catalog/catalogs/bcb2`, DEADLOCK),
    },
    {
      title: "catalog: not another body",
      issue: "catalogDeleteDeadlock",
      matches: false,
      message: failedUndo(`DELETE ${HOST}/api/catalog/catalogs/bcb2`, EF_SAVE_FAILURE),
    },
    {
      title: "catalog: not a product delete",
      issue: "catalogDeleteDeadlock",
      matches: false,
      message: failedUndo(`DELETE ${HOST}/api/catalog/products?ids=1`, DEADLOCK),
    },
  ] as const;

  for (const { title, issue, matches, message } of CASES) {
    test(title, () => {
      expect(failureOf(issue).test(message)).toBe(matches);
    });
  }
});

test.describe("issuesExplaining", () => {
  test("names the issue of each error and keeps the errors", () => {
    const hits = issuesExplaining([CONTACT_DEADLOCK, CATALOG_DEADLOCK_IN_TEST, CONTACT_DEADLOCK]);

    expect(hits?.map(({ issue, errors }) => [issue.name, errors.length])).toEqual([
      ["memberDeleteDeadlock", 2],
      ["catalogDeleteDeadlock", 1],
    ]);
  });

  test("explains nothing when one error is unknown", () => {
    expect(issuesExplaining([CONTACT_DEADLOCK, "Error: expect(received).toBe(expected)"])).toBeUndefined();
  });

  test("explains nothing when there are no errors", () => {
    expect(issuesExplaining([])).toBeUndefined();
  });
});
