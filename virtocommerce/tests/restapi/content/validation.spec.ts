import { contentPath } from "@builders/content.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";

const INVALID_FOLDER_NAMES = [
  { title: "whitespace only", name: " ", reason: "Folder name must not be empty" },
  { title: "an absolute path", name: "/etc/passwd", reason: "alphanumeric lower case" },
  { title: "the parent directory", name: "..", reason: "Minimum length is 3" },
  { title: "too long", name: "a".repeat(300), reason: "Maximum length is 63" },
] as const;

test.describe("content validation (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  for (const { title, name, reason } of INVALID_FOLDER_NAMES) {
    test(`reject a folder name that is ${title}`, async ({ api, store }) => {
      await test.step(`act and assert: creating the folder is rejected with "${reason}"`, async () => {
        const response = await api.post(`${contentPath("pages", store.id)}/folder`, {
          json: { name, type: "folder" },
        });
        expect(response.status).toBe(400);
        expect(response.text).toContain(reason);
      });
    });
  }
});
