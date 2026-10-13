import * as allure from "allure-js-commons";

import { expect, test } from "@fixtures";

const INVALID_FOLDER_NAMES = [
  { title: "whitespace only", name: " ", reason: "Folder name must not be empty" },
  { title: "an absolute path", name: "/etc/passwd", reason: "alphanumeric lower case" },
  { title: "the parent directory", name: "..", reason: "Minimum length is 3" },
  { title: "too long", name: "a".repeat(300), reason: "Maximum length is 63" },
] as const;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Content / Validation");
});

test.describe("content validation (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  for (const { title, name, reason } of INVALID_FOLDER_NAMES) {
    test(`reject a folder name that is ${title}`, async ({ api }) => {
      await allure.story("Folder names");
      await allure.description(`Creating a pages folder whose name is ${title} is rejected: "${reason}".`);

      await test.step(`assert: creating the folder is rejected with "${reason}"`, async () => {
        await expect(api.rest.content.folders.create("pages", name)).rejects.toBeHttpError(400, reason);
      });
    });
  }
});
