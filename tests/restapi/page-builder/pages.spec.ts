import * as allure from "allure-js-commons";

import { newPage } from "@dataset/builders/page-builder";
import { KNOWN_ISSUES } from "@dataset/known-issues";
import { MODULES } from "@dataset/modules";
import { expect, knownIssue, test } from "@fixtures";

const SEARCH_PAGE_SIZE = 20;
const SPECIAL_PERMALINKS = [
  {
    title: "spaces",
    permalink: "/my page test",
    outcome: "rejected with a validation error",
    issue: undefined,
    created: { status: "rejected", reason: expect.objectContaining({ name: "HttpError", status: 400 }) },
    stored: [],
  },
  {
    title: "reserved characters",
    permalink: "/page&test?q=1#anchor",
    outcome: "rejected with a validation error",
    issue: undefined,
    created: { status: "rejected", reason: expect.objectContaining({ name: "HttpError", status: 400 }) },
    stored: [],
  },
  {
    title: "a percent-encoded space",
    permalink: "/my%20page%20test",
    outcome: "rejected with a validation error",
    issue: undefined,
    created: { status: "rejected", reason: expect.objectContaining({ name: "HttpError", status: 400 }) },
    stored: [],
  },
  {
    title: "a zero-width space",
    permalink: `/page${String.fromCharCode(0x200b)}test`,
    outcome: "rejected with a validation error",
    issue: undefined,
    created: { status: "rejected", reason: expect.objectContaining({ name: "HttpError", status: 400 }) },
    stored: [],
  },
  {
    title: "angle brackets",
    permalink: "/page<test>",
    outcome: "rejected with a validation error",
    issue: undefined,
    created: { status: "rejected", reason: expect.objectContaining({ name: "HttpError", status: 400 }) },
    stored: [],
  },
  {
    title: "more than 2048 characters",
    permalink: `/${"a".repeat(2048)}`,
    outcome: "rejected with a validation error",
    issue: undefined,
    created: { status: "rejected", reason: expect.objectContaining({ name: "HttpError", status: 400 }) },
    stored: [],
  },
  {
    title: "unicode letters",
    permalink: "/страница-тест",
    outcome: "stored as given",
    issue: undefined,
    created: { status: "fulfilled", value: expect.objectContaining({ permalink: "/страница-тест" }) },
    stored: ["/страница-тест"],
  },
] as const;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Page Builder / Pages");
});

test.describe("page builder pages (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com", requiresModules: [MODULES.pageBuilder] });

  test("keyword search finds a page beyond the newest pages", async ({ api, arrange, store }) => {
    await allure.story("Search");
    await allure.description(
      `A keyword search with a page size of ${SEARCH_PAGE_SIZE} finds a page older than the newest ` +
        `${SEARCH_PAGE_SIZE}, so the keyword filters every page, not only the first page of the default sort.`,
    );
    const { pages } = api.rest.pageBuilder;
    const target = await test.step("arrange: the page to find", () => arrange.content.page());
    await test.step(`arrange: ${SEARCH_PAGE_SIZE} newer pages`, () =>
      Promise.all(Array.from({ length: SEARCH_PAGE_SIZE }, () => arrange.content.page())));
    await test.step(`arrange: the page is not among the newest ${SEARCH_PAGE_SIZE}`, async () => {
      const newest = await pages.search({ storeId: store.id, take: SEARCH_PAGE_SIZE });
      expect(newest.map(({ id }) => id)).not.toContain(target.id);
    });

    const found = await test.step(`act: search "${target.name}"`, () =>
      pages.search({ storeId: store.id, keyword: target.name, take: SEARCH_PAGE_SIZE }));

    await test.step("assert: the page is found", () => {
      expect(found.map(({ id }) => id)).toContain(target.id);
    });
  });

  test("a second page with an existing permalink is rejected", async ({ api, arrange, store }) => {
    await knownIssue(KNOWN_ISSUES.duplicatePermalinkAccepted);
    await allure.story("Permalinks");
    await allure.description(
      "Creating a page whose permalink another page of the store already has in the same language is rejected " +
        "with a validation error, and no page is created.",
    );
    const { pages } = api.rest.pageBuilder;
    const existing = await test.step("arrange: a page", () => arrange.content.page());
    const draft = newPage(store.id, store.defaultLanguage, { permalink: existing.permalink });
    arrange.content.deletePagesLater(draft.name);

    await test.step(`assert: creating ${draft.name} with the permalink ${existing.permalink} is rejected`, () =>
      expect(pages.createGroup(draft)).rejects.toBeHttpError(400));

    await test.step(`assert: no page named ${draft.name} exists`, async () => {
      const found = await pages.search({ storeId: store.id, keyword: draft.name, take: SEARCH_PAGE_SIZE });
      expect(found.filter(({ name }) => name === draft.name)).toEqual([]);
    });
  });

  for (const { title, permalink, outcome, issue, created, stored } of SPECIAL_PERMALINKS) {
    test(`a permalink with ${title} is ${outcome}`, async ({ api, arrange, store }) => {
      await knownIssue(issue);
      await allure.story("Permalinks");
      await allure.description(
        `Creating a page with the permalink "${permalink}" is ${outcome}: a permalink is a URL path, so ` +
          "whitespace and the reserved characters & ? # are not allowed, while letters of any script are.",
      );
      const { pages } = api.rest.pageBuilder;
      const draft = newPage(store.id, store.defaultLanguage, { permalink });
      arrange.content.deletePagesLater(draft.name);

      const [result] = await test.step(`act: create ${draft.name} with the permalink "${permalink}"`, () =>
        Promise.allSettled([pages.createGroup(draft)]));

      await test.step(`assert: the page is ${outcome}`, async () => {
        expect(result).toEqual(created);
        const found = await pages.search({ storeId: store.id, keyword: draft.name, take: SEARCH_PAGE_SIZE });
        expect(found.filter(({ name }) => name === draft.name).map((page) => page.permalink)).toEqual(stored);
      });
    });
  }
});
