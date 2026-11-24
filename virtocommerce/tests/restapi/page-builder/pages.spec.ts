import type {
  VirtoCommercePageBuilderModuleCoreModelsGroupedPageBuilderPage as GroupedPage,
  VirtoCommercePageBuilderModuleCoreModelsGroupedPageBuilderPageSearchResult as GroupedPageSearchResult,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newPage } from "@builders/page-builder.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { MODULES, PAGE_BUILDER_REPLACED } from "@modules";

const PAGES_PATH = "/api/page-builder-pages";
const SEARCH_PAGE_SIZE = 20;
const REJECTED = { outcome: "rejected with a validation error", status: 400, stored: [] } as const;
const SPECIAL_PERMALINKS = [
  { title: "spaces", permalink: "/my page test", ...REJECTED },
  { title: "reserved characters", permalink: "/page&test?q=1#anchor", ...REJECTED },
  { title: "a percent-encoded space", permalink: "/my%20page%20test", ...REJECTED },
  { title: "a zero-width space", permalink: `/page${String.fromCharCode(0x200b)}test`, ...REJECTED },
  {
    title: "an invisible character outside the BMP",
    permalink: `/page${String.fromCodePoint(0xe0041)}test`,
    ...REJECTED,
  },
  { title: "angle brackets", permalink: "/page<test>", ...REJECTED },
  { title: "more than 2048 characters", permalink: `/${"a".repeat(2048)}`, ...REJECTED },
  {
    title: "unicode letters",
    permalink: "/страница-тест",
    outcome: "stored as given",
    status: 200,
    stored: ["/страница-тест"],
  },
] as const;

test.skip(true, PAGE_BUILDER_REPLACED);

test.describe("page builder pages (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR, modules: { pageBuilder: MODULES.pageBuilder } });

  test("keyword search finds a page beyond the newest pages", async ({ api, arrange, store }) => {
    const target = await test.step("arrange: the page to find", () => arrange.content.page());
    await test.step(`arrange: ${SEARCH_PAGE_SIZE} newer pages`, () =>
      Promise.all(Array.from({ length: SEARCH_PAGE_SIZE }, () => arrange.content.page())));
    await test.step(`arrange: the page is not among the newest ${SEARCH_PAGE_SIZE}`, async () => {
      const newest = await pagesOf(api, { storeId: store.id, take: SEARCH_PAGE_SIZE });
      expect(newest.map(({ id }) => id)).not.toContain(target.id);
    });

    const found = await test.step(`act: search "${target.name}"`, () =>
      pagesOf(api, { storeId: store.id, keyword: target.name, take: SEARCH_PAGE_SIZE }));

    await test.step("assert: the page is found", () => {
      expect(found.map(({ id }) => id)).toContain(target.id);
    });
  });

  test("a second page with an existing permalink is rejected", async ({ api, arrange, store }) => {
    const existing = await test.step("arrange: a page", () => arrange.content.page());
    const draft = newPage(store.id, store.defaultLanguage, { permalink: existing.permalink });
    arrange.content.deletePagesLater(draft.name);

    await test.step(`act and assert: creating ${draft.name} with the permalink ${existing.permalink} is rejected`, async () => {
      expect((await api.post(`${PAGES_PATH}/create-group-page`, { json: draft })).status).toBe(400);
    });

    await test.step(`assert: no page named ${draft.name} exists`, async () => {
      const found = await pagesOf(api, { storeId: store.id, keyword: draft.name, take: SEARCH_PAGE_SIZE });
      expect(found.filter(({ name }) => name === draft.name)).toEqual([]);
    });
  });

  for (const { title, permalink, outcome, status, stored } of SPECIAL_PERMALINKS) {
    test(`a permalink with ${title} is ${outcome}`, async ({ api, arrange, store }) => {
      const draft = newPage(store.id, store.defaultLanguage, { permalink });
      arrange.content.deletePagesLater(draft.name);

      const response = await test.step(`act: create ${draft.name} with the permalink "${permalink}"`, () =>
        api.post(`${PAGES_PATH}/create-group-page`, { json: draft }));

      await test.step(`assert: the page is ${outcome}`, async () => {
        expect(response.status).toBe(status);
        if (response.ok) {
          expect(response.json<GroupedPage>().permalink).toBe(permalink);
        }
        const found = await pagesOf(api, { storeId: store.id, keyword: draft.name, take: SEARCH_PAGE_SIZE });
        expect(found.filter(({ name }) => name === draft.name).map((page) => page.permalink)).toEqual(stored);
      });
    });
  }
});

async function pagesOf(
  api: HttpClient,
  criteria: { readonly storeId: string; readonly keyword?: string; readonly take: number },
): Promise<GroupedPage[]> {
  const response = await api.post(`${PAGES_PATH}/search`, { json: criteria });
  return response.expectOk().json<GroupedPageSearchResult>().results ?? [];
}
