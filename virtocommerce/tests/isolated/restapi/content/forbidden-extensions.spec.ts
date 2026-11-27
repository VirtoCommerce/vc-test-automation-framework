import { contentPath } from "@builders/content.ts";
import { executableFile, markdownFile } from "@builders/files.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { DESTRUCTIVE_TAG } from "@virtocommerce/test-automation-framework/core";

const BLACKLIST_SETTING = "VirtoCommerce.Platform.Security.FileExtensionsBlackList";
const FORBIDDEN_EXTENSION = ".exe";
const REJECTION = `File extension ${FORBIDDEN_EXTENSION} is not allowed`;
const CONTENT_TYPES = ["pages", "blogs", "themes"] as const;

test.describe("forbidden file extensions (store administrator, global settings)", { tag: DESTRUCTIVE_TAG }, () => {
  test.use({ user: STORE_ADMINISTRATOR });

  for (const contentType of CONTENT_TYPES) {
    test(`reject a ${FORBIDDEN_EXTENSION} upload to ${contentType}`, async ({ api, arrange, store }) => {
      await test.step(`arrange: ${FORBIDDEN_EXTENSION} is blacklisted`, () =>
        arrange.platform.allowedValue(BLACKLIST_SETTING, FORBIDDEN_EXTENSION));
      const folderName = await test.step(`arrange: a ${contentType} folder`, () =>
        arrange.content.contentFolder(contentType));

      const response = await test.step(`act: upload a ${FORBIDDEN_EXTENSION} file`, () =>
        api.post(contentPath(contentType, store.id), {
          query: { folderUrl: folderName },
          multipart: { file: executableFile() },
        }));

      await test.step("assert: the upload is rejected", () => {
        expect(response.ok).toBe(false);
        expect(response.text).toContain(REJECTION);
      });
    });
  }

  test(`reject renaming a blog post to ${FORBIDDEN_EXTENSION}`, async ({ api, arrange, store }) => {
    await test.step(`arrange: ${FORBIDDEN_EXTENSION} is blacklisted`, () =>
      arrange.platform.allowedValue(BLACKLIST_SETTING, FORBIDDEN_EXTENSION));
    const { item } = await test.step("arrange: an uploaded blog post", () =>
      arrange.content.contentFile("blogs", markdownFile("test-blogs")));

    const response = await test.step(`act: rename the post to ${FORBIDDEN_EXTENSION}`, () =>
      api.get(`${contentPath("blogs", store.id)}/move`, {
        query: { oldUrl: item.url, newUrl: item.url.replace(/\.md$/, FORBIDDEN_EXTENSION) },
      }));

    await test.step("assert: the rename is rejected", () => {
      expect(response.ok).toBe(false);
      expect(response.text).toContain(REJECTION);
    });
  });
});
