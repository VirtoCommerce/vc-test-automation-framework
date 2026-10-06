import type { ContentType } from "@api/rest/types/content";

import * as allure from "allure-js-commons";

import { ContentClient, contentPath } from "@api/rest/clients/content-client";
import { SettingsClient } from "@api/rest/clients/settings-client";
import { uniqueId } from "@core/unique-id";
import { arrangeSettingValue } from "@dataset/arrange/settings";
import { FILE_EXTENSIONS_BLACKLIST_SETTING, FORBIDDEN_EXTENSION, newForbiddenFile } from "@dataset/builders/content";
import { asWorkerAdministrator, expect, test } from "@fixtures";

const UPLOAD_CONTENT_TYPES: readonly ContentType[] = ["pages", "blogs", "themes"];
const INVALID_FOLDER_NAMES = [
  { title: "whitespace only", name: " ", reason: "Folder name must not be empty" },
  { title: "absolute path", name: "/etc/passwd", reason: "alphanumeric lower case" },
  { title: "parent directory", name: "..", reason: "Minimum length is 3" },
  { title: "too long", name: "a".repeat(300), reason: "Maximum length is 63" },
] as const;

test.beforeEach(async () => {
  await allure.feature("Content / Validation");
});

test.describe("content validation (admin)", () => {
  test.use({ user: asWorkerAdministrator });

  for (const { title, name, reason } of INVALID_FOLDER_NAMES) {
    test(`reject a folder name: ${title}`, async ({ httpClient, cleanupStack, env }) => {
      const contentClient = new ContentClient(httpClient, env.storeId);

      const response = await test.step("act: create folder with an invalid name", () =>
        httpClient.post(`${contentPath("pages", env.storeId)}/folder`, { json: { name, type: "folder" } }));
      if (response.ok) {
        cleanupStack.push(`remove wrongly created pages folder ${title}`, () =>
          contentClient.removeFolder("pages", name),
        );
      }

      await test.step("assert: folder name is rejected with a reason", async () => {
        expect(response.status).toBe(400);
        expect(response.text).toContain(reason);
      });
    });
  }

  test.describe("forbidden file extensions", () => {
    test.describe.configure({ mode: "default" });

    for (const contentType of UPLOAD_CONTENT_TYPES) {
      test(`reject a ${FORBIDDEN_EXTENSION} upload to ${contentType}`, async ({ httpClient, cleanupStack, env }) => {
        const contentClient = new ContentClient(httpClient, env.storeId);
        const settingsClient = new SettingsClient(httpClient);
        const folderName = uniqueId("test-folder");
        await test.step(`arrange: ${FORBIDDEN_EXTENSION} is blacklisted`, () =>
          arrangeSettingValue(settingsClient, cleanupStack, FILE_EXTENSIONS_BLACKLIST_SETTING, FORBIDDEN_EXTENSION));
        cleanupStack.push(`remove ${contentType} folder ${folderName}`, () =>
          contentClient.removeFolder(contentType, folderName),
        );
        await test.step("arrange: folder", () => contentClient.createFolder(contentType, folderName));

        const response = await test.step(`act: upload a ${FORBIDDEN_EXTENSION} file`, () =>
          httpClient.post(contentPath(contentType, env.storeId), {
            query: { folderUrl: folderName },
            multipart: { file: newForbiddenFile() },
          }));

        await test.step("assert: upload is rejected", async () => {
          expect(response.ok).toBe(false);
          expect(response.text).toContain(`File extension ${FORBIDDEN_EXTENSION} is not allowed`);
        });
      });
    }
  });
});
