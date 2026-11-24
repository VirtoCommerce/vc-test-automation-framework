import type { Arrange } from "@arrange";
import type {
  VirtoCommerceContentModuleCoreModelContentItem as ContentItem,
  VirtoCommerceContentModuleCoreModelContentStatistic as ContentStatistic,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { contentPath } from "@builders/content.ts";
import { markdownFile } from "@builders/files.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { requireFields } from "@support/require-fields.ts";
import { PLATFORM_DEFECT_TAG } from "@virtocommerce/test-automation-framework/core";

const CONTENT_TYPES = ["pages", "blogs", "themes"] as const;
const COUNTED_CONTENT = [
  {
    counter: "pagesCount",
    content: "a page",
    add: (arrange: Arrange) => arrange.content.contentFile("pages", markdownFile("test-pages")),
  },
  { counter: "blogsCount", content: "a blog", add: (arrange: Arrange) => arrange.content.contentFolder("blogs") },
  { counter: "themesCount", content: "a theme", add: (arrange: Arrange) => arrange.content.contentFolder("themes") },
] as const;
const DOCUMENTS = [
  { document: "page", contentType: "pages" },
  { document: "blog post", contentType: "blogs" },
] as const;

test.describe("content files (store administrator)", () => {
  test.describe.configure({ mode: "default" });
  test.use({ user: STORE_ADMINISTRATOR });

  for (const { counter, content, add } of COUNTED_CONTENT) {
    test(`count ${content} in the content statistic`, {
      tag: PLATFORM_DEFECT_TAG,
      annotation: { type: "issue", description: "https://virtocommerce.atlassian.net/browse/VCST-6444" },
    }, async ({ api, arrange, store }) => {
      const before = await test.step("arrange: the content statistic", () => statisticOf(api, store.id));
      await test.step(`arrange: ${content}`, async () => {
        await add(arrange);
      });

      const after = await test.step("act: get the content statistic", () => statisticOf(api, store.id));

      await test.step(`assert: ${counter} is one more than before`, () => {
        expect(after[counter]).toBe((before[counter] ?? 0) + 1);
      });
    });
  }

  for (const contentType of CONTENT_TYPES) {
    test(`find a folder in ${contentType}`, async ({ api, arrange, store }) => {
      const folderName = await test.step(`arrange: a ${contentType} folder`, () =>
        arrange.content.contentFolder(contentType));

      const found = await test.step("act: search by the folder's name", () =>
        itemsOf(api, contentPath(contentType, store.id), folderName));

      await test.step("assert: the folder is found", () => {
        expect(found).toContainEqual(expect.objectContaining({ name: folderName, type: "folder" }));
      });
    });
  }

  for (const { document, contentType } of DOCUMENTS) {
    test(`upload, rename and delete a ${document}`, async ({ api, arrange, store }) => {
      const path = contentPath(contentType, store.id);
      const folderName = await test.step(`arrange: a ${contentType} folder`, () =>
        arrange.content.contentFolder(contentType));
      const file = markdownFile(`test-${contentType}`);
      const renamedName = `renamed-${file.name}`;

      await test.step(`act: upload the ${document}`, async () =>
        (await api.post(path, { query: { folderUrl: folderName }, multipart: { file } })).expectOk());
      const uploaded = await test.step(`assert: the ${document} is found with its content`, async () => {
        const found = await itemNamed(api, path, file.name);
        expect((await api.get(path, { query: { relativeUrl: found.relativeUrl } })).expectOk().text).toBe(
          file.buffer.toString(),
        );
        return found;
      });
      const renamedUrl = uploaded.url.replace(file.name, renamedName);

      await test.step(`act: rename the ${document}`, async () =>
        (await api.get(`${path}/move`, { query: { oldUrl: uploaded.url, newUrl: renamedUrl } })).expectOk());
      await test.step(`assert: the ${document} is found by its new name`, async () => {
        expect(await itemNamed(api, path, renamedName)).toMatchObject({ url: renamedUrl });
      });

      await test.step(`act: delete the ${document}`, async () =>
        (await api.delete(path, { query: { urls: [renamedUrl] } })).expectOk());
      await test.step(`assert: the ${document} is gone`, async () => {
        expect((await itemsOf(api, path, renamedName)).filter(({ name }) => name === renamedName)).toEqual([]);
      });
    });
  }

  test("rename and delete a theme folder", async ({ api, arrange, store }) => {
    const path = contentPath("themes", store.id);
    const folderName = await test.step("arrange: a themes folder", () => arrange.content.contentFolder("themes"));
    const folder = await test.step("arrange: the folder, as search finds it", () => itemNamed(api, path, folderName));
    const renamedName = `${folderName}-renamed`;
    const renamedUrl = folder.url.replace(folderName, renamedName);
    arrange.content.deleteContentFolderLater("themes", renamedName);

    await test.step("act: rename the folder", async () =>
      (await api.get(`${path}/move`, { query: { oldUrl: folder.url, newUrl: renamedUrl } })).expectOk());
    await test.step("assert: the folder is found by its new name", async () => {
      expect(await itemNamed(api, path, renamedName)).toMatchObject({ type: "folder" });
    });

    await test.step("act: delete the folder", async () =>
      (await api.delete(path, { query: { urls: [renamedUrl] } })).expectOk());
    await test.step("assert: the folder is gone", async () => {
      expect((await itemsOf(api, path, renamedName)).filter(({ name }) => name === renamedName)).toEqual([]);
    });
  });
});

async function statisticOf(api: HttpClient, storeId: string): Promise<ContentStatistic> {
  return (await api.get(`/api/content/${storeId}/stats`)).expectOk().json<ContentStatistic>();
}

async function itemsOf(api: HttpClient, path: string, keyword: string): Promise<ContentItem[]> {
  return (await api.get(`${path}/search`, { query: { keyword } })).expectOk().json<ContentItem[]>();
}

async function itemNamed(
  api: HttpClient,
  path: string,
  name: string,
): Promise<ContentItem & { readonly url: string; readonly relativeUrl: string }> {
  const item = (await itemsOf(api, path, name)).find((found) => found.name === name);
  return requireFields(item, ["url", "relativeUrl"], `Content item ${name}`);
}
