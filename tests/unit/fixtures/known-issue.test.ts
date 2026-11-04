import { expect, test } from "@playwright/test";

import { KNOWN_ISSUES } from "@dataset/known-issues";

import { issuesExplaining } from "../../../fixtures/known-issue";

const CONTACT_DEADLOCK =
  "cleanup: delete contact Test Customer Cgjbgnng: DELETE http://localhost:8090/api/contacts?ids=9dd4e26a → 500 " +
  'Internal Server Error\n{"message":"An error occurred while saving the entity changes. See the inner exception."}';
const CATALOG_DEADLOCK_IN_TEST =
  "HttpError: DELETE http://localhost:8090/api/catalog/catalogs/bcb22f4b → 500 Internal Server Error\n" +
  '{"message":"Transaction (Process ID 71) was deadlocked on lock resources with another process."}';

test.describe("issuesExplaining", () => {
  test("names the issue of each error and keeps the errors", () => {
    const hits = issuesExplaining([CONTACT_DEADLOCK, CATALOG_DEADLOCK_IN_TEST, CONTACT_DEADLOCK]);

    expect(hits?.map(({ issue, errors }) => [issue.key, errors.length])).toEqual([
      [KNOWN_ISSUES.memberDeleteDeadlock.key, 2],
      [KNOWN_ISSUES.catalogDeleteDeadlock.key, 1],
    ]);
  });

  test("explains nothing when one error is unknown", () => {
    expect(issuesExplaining([CONTACT_DEADLOCK, "Error: expect(received).toBe(expected)"])).toBeUndefined();
  });

  test("explains nothing when there are no errors", () => {
    expect(issuesExplaining([])).toBeUndefined();
  });
});
