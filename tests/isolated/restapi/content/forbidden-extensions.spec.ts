import * as allure from "allure-js-commons";

import { executableFile, markdownFile } from "@dataset/builders/files";
import { expect, test } from "@fixtures";

const BLACKLIST_SETTING = "VirtoCommerce.Platform.Security.FileExtensionsBlackList";
const FORBIDDEN_EXTENSION = ".exe";
const REJECTION = `File extension ${FORBIDDEN_EXTENSION} is not allowed`;
const CONTENT_TYPES = ["pages", "blogs", "themes"] as const;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Content / Validation");
});

test.describe("forbidden file extensions (store administrator, global settings)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  for (const contentType of CONTENT_TYPES) {
    test(`reject a ${FORBIDDEN_EXTENSION} upload to ${contentType}`, async ({ api, arrange }) => {
      await allure.story("File extensions");
      await allure.description(
        `With ${FORBIDDEN_EXTENSION} blacklisted, uploading such a file to ${contentType} is rejected.`,
      );
      await test.step(`arrange: ${FORBIDDEN_EXTENSION} is blacklisted`, () =>
        arrange.platform.allowedValue(BLACKLIST_SETTING, FORBIDDEN_EXTENSION));
      const folderName = await test.step(`arrange: a ${contentType} folder`, () =>
        arrange.content.contentFolder(contentType));

      await test.step(`assert: uploading a ${FORBIDDEN_EXTENSION} file is rejected`, async () => {
        await expect(api.rest.content.items.upload(contentType, folderName, executableFile())).rejects.toThrow(
          REJECTION,
        );
      });
    });
  }

  test(`reject renaming a blog post to ${FORBIDDEN_EXTENSION}`, async ({ api, arrange }) => {
    await allure.story("File extensions");
    await allure.description(`With ${FORBIDDEN_EXTENSION} blacklisted, a blog post cannot be renamed to such a file.`);
    await test.step(`arrange: ${FORBIDDEN_EXTENSION} is blacklisted`, () =>
      arrange.platform.allowedValue(BLACKLIST_SETTING, FORBIDDEN_EXTENSION));
    const { item } = await test.step("arrange: an uploaded blog post", () =>
      arrange.content.contentFile("blogs", markdownFile("test-blogs")));

    await test.step(`assert: renaming the post to ${FORBIDDEN_EXTENSION} is rejected`, async () => {
      await expect(
        api.rest.content.items.move("blogs", item.url, item.url.replace(/\.md$/, FORBIDDEN_EXTENSION)),
      ).rejects.toThrow(REJECTION);
    });
  });
});
