import type { Arrange } from "@dataset/arrange";

import * as allure from "allure-js-commons";

import { markdownFile } from "@dataset/builders/files";
import { KNOWN_ISSUES } from "@dataset/known-issues";
import { expect, knownIssue, test } from "@fixtures";

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

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Content / Files");
});

test.describe("content files (store administrator)", () => {
  test.describe.configure({ mode: "default" });
  test.use({ user: "acme_store_administrator@acme.com" });

  for (const { counter, content, add } of COUNTED_CONTENT) {
    test(`count ${content} in the content statistic`, async ({ api, arrange }) => {
      await knownIssue(KNOWN_ISSUES.contentStatisticNotCounted);
      await allure.story("Statistic");
      await allure.description(`Adding ${content} to the store's content raises the statistic's ${counter} by one.`);
      const before = await test.step("arrange: the content statistic", () => api.rest.content.getStatistic());
      await test.step(`arrange: ${content}`, async () => {
        await add(arrange);
      });

      const after = await test.step("act: get the content statistic", () => api.rest.content.getStatistic());

      await test.step(`assert: ${counter} is one more than before`, () => {
        expect(after[counter]).toBe(before[counter] + 1);
      });
    });
  }

  for (const contentType of CONTENT_TYPES) {
    test(`find a folder in ${contentType}`, async ({ api, arrange }) => {
      await allure.story("Search");
      await allure.description(`A folder created in ${contentType} is found by its name, as a folder.`);
      const folderName = await test.step(`arrange: a ${contentType} folder`, () =>
        arrange.content.contentFolder(contentType));

      const found = await test.step("act: search by the folder's name", () =>
        api.rest.content.items.search(contentType, folderName));

      await test.step("assert: the folder is found", () => {
        expect(found).toContainEqual(expect.objectContaining({ name: folderName, type: "folder" }));
      });
    });
  }

  for (const { document, contentType } of DOCUMENTS) {
    test(`upload, rename and delete a ${document}`, async ({ api, arrange }) => {
      await allure.story("Files");
      await allure.description(
        `A ${document} uploaded to ${contentType} keeps its content, is found by its new name after a rename, ` +
          "and is gone after it is deleted.",
      );
      const folderName = await test.step(`arrange: a ${contentType} folder`, () =>
        arrange.content.contentFolder(contentType));
      const file = markdownFile(`test-${contentType}`);
      const renamedName = `renamed-${file.name}`;

      await test.step(`act: upload the ${document}`, () =>
        api.rest.content.items.upload(contentType, folderName, file));
      const uploaded = await test.step(`assert: the ${document} is found with its content`, async () => {
        const found = await api.rest.content.items.getByName(contentType, file.name);
        expect(await api.rest.content.items.getText(contentType, found.relativeUrl)).toBe(file.buffer.toString());
        return found;
      });
      const renamedUrl = uploaded.url.replace(file.name, renamedName);

      await test.step(`act: rename the ${document}`, () =>
        api.rest.content.items.move(contentType, uploaded.url, renamedUrl));
      await test.step(`assert: the ${document} is found by its new name`, async () => {
        expect(await api.rest.content.items.getByName(contentType, renamedName)).toMatchObject({ url: renamedUrl });
      });

      await test.step(`act: delete the ${document}`, () => api.rest.content.items.delete(contentType, [renamedUrl]));
      await test.step(`assert: the ${document} is gone`, async () => {
        expect(await api.rest.content.items.findByName(contentType, renamedName)).toBeUndefined();
      });
    });
  }

  test("rename and delete a theme folder", async ({ api, arrange, cleanup }) => {
    await allure.story("Folders");
    await allure.description("A renamed theme folder is found by its new name, and is gone after it is deleted.");
    const folderName = await test.step("arrange: a themes folder", () => arrange.content.contentFolder("themes"));
    const folder = await test.step("arrange: the folder, as search finds it", () =>
      api.rest.content.items.getByName("themes", folderName));
    const renamedName = `${folderName}-renamed`;
    const renamedUrl = folder.url.replace(folderName, renamedName);
    cleanup.push(`delete themes folder ${renamedName}`, () => api.rest.content.folders.delete("themes", renamedName));

    await test.step("act: rename the folder", () => api.rest.content.items.move("themes", folder.url, renamedUrl));
    await test.step("assert: the folder is found by its new name", async () => {
      expect(await api.rest.content.items.getByName("themes", renamedName)).toMatchObject({ type: "folder" });
    });

    await test.step("act: delete the folder", () => api.rest.content.items.delete("themes", [renamedUrl]));
    await test.step("assert: the folder is gone", async () => {
      expect(await api.rest.content.items.findByName("themes", renamedName)).toBeUndefined();
    });
  });
});
