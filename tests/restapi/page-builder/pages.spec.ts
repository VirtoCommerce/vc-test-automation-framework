import * as allure from "allure-js-commons";

import { newPage } from "@dataset/builders/page-builder";
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
    title: "an invisible character outside the BMP",
    permalink: `/page${String.fromCodePoint(0xe0041)}test`,
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

  test("a second page with an existing permalink is created", async ({ api, arrange, store }) => {
    await allure.story("Permalinks");
    await allure.description(
      "A page may use the permalink of a published page of the store, for example for another audience or " +
        "period; whether both may be published is checked when the second one is published.",
    );
    const { pages } = api.rest.pageBuilder;
    const existing = await test.step("arrange: a published page", () => arrange.content.publishedPage());
    const draft = newPage(store.id, store.defaultLanguage, { permalink: existing.permalink });
    arrange.content.deletePagesLater(draft.name);

    const created = await test.step(`act: create ${draft.name} with the permalink ${existing.permalink}`, () =>
      pages.createGroup(draft));

    await test.step("assert: the page is created with that permalink", () => {
      expect(created.permalink).toBe(existing.permalink);
    });
  });

  test("the permalink usages of a page list a published page with that permalink as a conflict", async ({
    api,
    arrange,
  }) => {
    await allure.story("Permalinks");
    await allure.description(
      "The permalink usages of a draft list a published page with the same permalink for the same visitors as a " +
        "certain conflict that can be resolved by unpublishing it.",
    );
    const { pages } = api.rest.pageBuilder;
    const existing = await test.step("arrange: a published page", () => arrange.content.publishedPage());
    const page = await test.step(`arrange: a draft with the permalink ${existing.permalink}`, () =>
      arrange.content.page({ permalink: existing.permalink }));

    const usages = await test.step(`act: read the permalink usages of ${page.name}`, () => pages.permalinkUsages(page));

    await test.step(`assert: ${existing.name} is listed as a certain conflict`, () => {
      expect(usages).toContainEqual(
        expect.objectContaining({ groupId: existing.id, conflict: "Certain", canUnpublish: true }),
      );
    });
  });

  test("publishing a page with the permalink of a published page for the same visitors is rejected", async ({
    api,
    arrange,
  }) => {
    await allure.story("Permalinks");
    await allure.description(
      "Publishing a page is rejected with a conflict while another published page of the store has its " +
        "permalink for the same visitors, and neither page changes.",
    );
    const { pages } = api.rest.pageBuilder;
    const existing = await test.step("arrange: a published page", () => arrange.content.publishedPage());
    const page = await test.step(`arrange: a draft with the permalink ${existing.permalink}`, () =>
      arrange.content.page({ permalink: existing.permalink }));

    await test.step(`assert: publishing ${page.name} is rejected`, () =>
      expect(pages.publish(page.id, { unpublishConflicting: false })).rejects.toBeHttpError(409));

    await test.step(`assert: ${existing.name} is still published and ${page.name} is not`, async () => {
      expect(await pages.publishStatus(existing.id)).toMatchObject({ published: true });
      expect(await pages.publishStatus(page.id)).toMatchObject({ published: false });
    });
  });

  test("publishing with unpublishConflicting unpublishes the page with the same permalink", async ({
    api,
    arrange,
  }) => {
    await allure.story("Permalinks");
    await allure.description(
      "Publishing a page with unpublishConflicting unpublishes the published page that has its permalink for the " +
        "same visitors, in the same save.",
    );
    const { pages } = api.rest.pageBuilder;
    const existing = await test.step("arrange: a published page", () => arrange.content.publishedPage());
    const page = await test.step(`arrange: a draft with the permalink ${existing.permalink}`, () =>
      arrange.content.page({ permalink: existing.permalink }));

    await test.step(`act: publish ${page.name} and unpublish the conflicting page`, () =>
      pages.publish(page.id, { unpublishConflicting: true }));

    await test.step(`assert: ${page.name} is published and ${existing.name} is not`, async () => {
      expect(await pages.publishStatus(page.id)).toMatchObject({ published: true });
      expect(await pages.publishStatus(existing.id)).toMatchObject({ published: false });
    });
  });

  test("a page with the permalink of a published page for other user groups is published", async ({ api, arrange }) => {
    await allure.story("Permalinks");
    await allure.description(
      "Pages for signed-in users of different user groups may both be published with the same permalink: only a " +
        "user in both groups could get either of them.",
    );
    const { pages } = api.rest.pageBuilder;
    const existing = await test.step("arrange: a published page for the user group qa-group-a", () =>
      arrange.content.publishedPage({ visibility: false, userGroups: "qa-group-a" }));
    const page = await test.step(`arrange: a draft with the permalink ${existing.permalink} for qa-group-b`, () =>
      arrange.content.page({ permalink: existing.permalink, visibility: false, userGroups: "qa-group-b" }));

    await test.step(`act: publish ${page.name}`, () => pages.publish(page.id, { unpublishConflicting: false }));

    await test.step("assert: both pages are published", async () => {
      expect(await pages.publishStatus(page.id)).toMatchObject({ published: true });
      expect(await pages.publishStatus(existing.id)).toMatchObject({ published: true });
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
