# Refinements

Architecture and design refinements for this project, ordered by value for the effort. Each item says what is
wrong today, what to change, and roughly how big the change is. When an item is done, remove it from this file.
No refinement is open right now; what is left is the end of the old suite's migration.

## 1. Left from the migration of the old suite

Every test of the old suite is ported, merged or dropped except the four below. The migration map (`TESTS.md`) was
removed once only these were left; it stays in the git history.

**Four tests waiting for a tracker key.** Each was recorded as a platform defect before checking that the defect is
real. Two of the six known issues checked in October 2026 turned out to be our own test data or intended behaviour,
so check each one first: a raw request or the UI by hand, the module source at the current version, and whether the
old test's expectation is right. Then port it with `knownIssue` and a tracker key, or as a normal test with the
right expectation, or drop it.

| Old test | What it expected | Suspected defect | Goes to |
|---|---|---|---|
| send a verification email (`platform/user-passwords.spec.ts`) | a `ConfirmationEmailNotification` entry in the notification journal | no entry appears | `tests/restapi/security/`; `UsersClient.sendVerificationEmail` is kept for it |
| reject a store without a name (`store/stores.spec.ts`) | a 4xx | the platform answers 500 | `tests/restapi/store/` |
| publishing a page shows a success toast (`page-builder/page-status.spec.ts`) | a toast on publish | no toast | `tests/e2e/backend/page-builder/page-status.spec.ts` |
| unpublishing a page shows a success toast (`page-builder/page-status.spec.ts`) | a toast on unpublish | no toast | `tests/e2e/backend/page-builder/page-status.spec.ts` |

**An open question for the platform team.** A plain `org-employee` can read the full account (email, roles,
contact id) of any user in the same organization through the GraphQL `user` query; outside the organization the
platform answers `Forbidden`. If that is intended, add a positive "a colleague's account is readable" test; if not,
add a test expecting `Forbidden`, marked as a known issue.

**Known issues, tracked in Jira.** 8 REST tests carry a `knownIssue` mark with a tracker key, so they run as
expected failures linked to the ticket. When a ticket is fixed the test passes, the run reports it, and the entry in
`dataset/known-issues.ts` goes. When a ticket is closed as intended, rewrite or delete the test and drop the entry.

| Ticket | Behaviour | Owner | Tests |
|---|---|---|---|
| [VCST-6440](https://virtocommerce.atlassian.net/browse/VCST-6440) | OAuth app search ignores `keyword` and `objectIds` | Platform | 1 |
| [VCST-6441](https://virtocommerce.atlassian.net/browse/VCST-6441) | Completeness channel search ignores `keyword` and `objectIds` | CatalogPublishing | 1 |
| [VCST-6442](https://virtocommerce.atlassian.net/browse/VCST-6442) | A second page with an existing permalink is accepted | PageBuilder | 1 |
| [VCST-6443](https://virtocommerce.atlassian.net/browse/VCST-6443) | Permalinks with spaces or `& ? #` are stored as sent | PageBuilder | 2 |
| [VCST-6444](https://virtocommerce.atlassian.net/browse/VCST-6444) | Content statistics return `-1`: enable `Content:StatisticEnabled` in CI | DevOps | 3 |

For VCST-6444, once devops releases the new `docker-env-full` tag, bump it in our workflow and remove
`contentStatisticNotCounted` in the same commit. Locally, add `- Content:StatisticEnabled=true` to the platform
service of the compose file.

**Resolved: "ship-to label not refreshed" was our test data.** The header kept "Select address" after a saved
address was picked, until a reload. Test customers were named like `Customer-14f6af4e`, and `updateContact`, which
saves the pick, refuses names with digits or dashes, so the pick was never saved. Contacts now get letter-only
names (`uniqueName`) and the known issue is gone. A UX note for the frontend team: when `updateContact` fails, the
frontend shows no error.
