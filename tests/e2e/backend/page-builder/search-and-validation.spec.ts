import * as allure from "allure-js-commons";

import { describeIssue, KNOWN_ISSUES } from "@dataset/known-issues";
import { expect, test } from "@fixtures";
import { Route } from "@pages/backend/page-builder/constants";
import { expectToolbarButtonDisabled, expectToolbarButtonEnabled } from "@pages/backend/shell/blade-toolbar";

import { arrangeDraftPage, DEFAULT_LANGUAGE, findPagesNamed, uiPageName } from "./page-builder-support";

const SEARCH_MARKER = "searchable";
const NO_MATCH = "&";
const SEEDED_PAGE = "our-team";
const EXISTING_PERMALINK_SOURCE = "qa-dup-source";
const SPECIAL_PERMALINKS = [
  { title: "spaces", permalink: "/my page test", knownIssue: KNOWN_ISSUES.permalinkStoredVerbatim },
  {
    title: "reserved characters",
    permalink: "/page&test?q=1#anchor",
    knownIssue: KNOWN_ISSUES.permalinkStoredVerbatim,
  },
  { title: "unicode letters", permalink: "/страница-тест", knownIssue: undefined },
] as const;

test.beforeEach(async () => {
  await allure.feature("Page Builder Shell / Search and validation (E2E)");
});

test.describe("page search (platform admin)", () => {
  test("search matches part of the name and ignores case", async ({
    pageBuilder,
    pageBuilderClient,
    cleanupStack,
    env,
  }) => {
    const page = await arrangeDraftPage(
      pageBuilderClient,
      cleanupStack,
      env.storeId,
      uiPageName(pageBuilderClient, cleanupStack, env.storeId, `qa-${SEARCH_MARKER}`),
    );
    const listing = pageBuilder.listBlade;
    const rows = listing.pageRows(page.name);
    await test.step("arrange: open every page", () => pageBuilder.open(Route.all));

    await test.step(`act: search "${SEARCH_MARKER}"`, () => listing.search(SEARCH_MARKER));
    const lowerCaseNames = await test.step("assert: the page is found", async () => {
      await expect(rows).toHaveCount(1);
      return listing.names();
    });

    await test.step(`act: search "${SEARCH_MARKER.toUpperCase()}"`, () => listing.search(SEARCH_MARKER.toUpperCase()));
    await test.step("assert: the same pages are found", async () => {
      await expect(rows).toHaveCount(1);
      expect(await listing.names()).toEqual(lowerCaseNames);
    });

    await test.step(`act: search "${NO_MATCH}"`, () => listing.search(NO_MATCH));
    await test.step("assert: the page is excluded without an error", async () => {
      await expect(rows).toHaveCount(0);
      await expect(pageBuilder.notifications.error).toHaveCount(0);
    });

    await test.step("act: clear the search", () => listing.clearSearch());
    await test.step("assert: the page is listed again", async () => {
      await expect(rows).toHaveCount(1);
    });
  });

  test("search finds a page beyond the first page of the default sort", async ({ pageBuilder }) => {
    const pagination = await test.step("arrange: open every page", async () => {
      await pageBuilder.open(Route.all);
      return pageBuilder.listBlade.grid.paginationInfo();
    });
    test.skip(
      pagination === undefined || pagination.total <= pagination.last,
      "The store has a single page of results, so the defect cannot show",
    );
    test.fail(true, describeIssue(KNOWN_ISSUES.pageSearchSortWindow));

    await test.step(`act: search for "${SEEDED_PAGE}"`, () => pageBuilder.listBlade.search(SEEDED_PAGE));

    await test.step(`assert: ${SEEDED_PAGE} is found`, async () => {
      await expect(pageBuilder.listBlade.pageRows(SEEDED_PAGE)).toHaveCount(1);
    });
  });
});

test.describe("page validation (platform admin)", () => {
  for (const [fields, enabled] of [
    [{ name: "", permalink: "" }, false],
    [{ name: "qa-missing-permalink", permalink: "" }, false],
    [{ name: "", permalink: "/qa-missing-name" }, false],
    [{ name: "qa-both-fields", permalink: "/qa-both-fields" }, true],
  ] as const) {
    test(`Save is ${enabled ? "enabled" : "disabled"} with ${JSON.stringify(fields)}`, async ({ pageBuilder }) => {
      const details = await test.step("arrange: start a new page", async () => {
        await pageBuilder.open(Route.draft);
        return pageBuilder.addPage();
      });

      await test.step(`act: fill ${JSON.stringify(fields)}`, () => details.fill(fields));

      await test.step(`assert: Save is ${enabled ? "enabled" : "disabled"}`, async () => {
        if (enabled) {
          await expectToolbarButtonEnabled(details.saveButton);
        } else {
          await expectToolbarButtonDisabled(details.saveButton);
        }
      });
    });
  }

  test("a duplicate permalink is rejected", async ({ pageBuilder, pageBuilderClient, cleanupStack, env }) => {
    test.fail(true, describeIssue(KNOWN_ISSUES.duplicatePermalinkAccepted));
    const existing = await arrangeDraftPage(
      pageBuilderClient,
      cleanupStack,
      env.storeId,
      uiPageName(pageBuilderClient, cleanupStack, env.storeId, EXISTING_PERMALINK_SOURCE),
    );
    const name = uiPageName(pageBuilderClient, cleanupStack, env.storeId, "qa-dup");

    const response = await test.step(`act: save ${name} with the permalink ${existing.permalink}`, () =>
      pageBuilder.createPage({ name, permalink: existing.permalink }, DEFAULT_LANGUAGE));

    await test.step("assert: the save is rejected and no page is created", async () => {
      expect(response.ok(), `save answered ${response.status()}`).toBe(false);
      expect(await findPagesNamed(pageBuilderClient, env.storeId, name)).toEqual([]);
    });
  });

  for (const { title, permalink, knownIssue } of SPECIAL_PERMALINKS) {
    test(`a permalink with ${title} is sanitised or rejected`, async ({
      pageBuilder,
      pageBuilderClient,
      cleanupStack,
      env,
    }) => {
      test.fail(knownIssue !== undefined, knownIssue === undefined ? undefined : describeIssue(knownIssue));
      const name = uiPageName(pageBuilderClient, cleanupStack, env.storeId, "qa-chars");

      const response = await test.step(`act: save ${name} with the permalink "${permalink}"`, () =>
        pageBuilder.createPage({ name, permalink }, DEFAULT_LANGUAGE));

      await test.step("assert: the page is stored with a clean permalink, or rejected with a validation error", async () => {
        const stored = await findPagesNamed(pageBuilderClient, env.storeId, name);
        if (response.ok()) {
          expect(stored).toEqual([expect.objectContaining({ permalink: expect.not.stringMatching(/[\s?#]/) })]);
          await expect(pageBuilder.notifications.error).toHaveCount(0);
        } else {
          expect(response.status(), "a validation error, not a server error").toBeLessThan(500);
          expect(stored).toEqual([]);
        }
      });
    });
  }
});
