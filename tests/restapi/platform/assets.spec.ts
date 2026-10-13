import * as allure from "allure-js-commons";

import { uniqueId } from "@core/unique-id";
import { textFile } from "@dataset/builders/files";
import { expect, test } from "@fixtures";

const PINNED_REPOSITORY_URL =
  "https://raw.githubusercontent.com/VirtoCommerce/vc-testing-module/08b9d932b5c988d23b551ba8da1e4e2a0ad0b498";
const REMOTE_FILES = [
  { title: "a markdown file", name: "README.md", url: `${PINNED_REPOSITORY_URL}/README.md` },
  { title: "a dotfile", name: ".gitignore", url: `${PINNED_REPOSITORY_URL}/.gitignore` },
] as const;

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Platform / Assets");
});

test.describe("platform assets (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  for (const { title, name, url } of REMOTE_FILES) {
    test(`upload ${title} from a URL`, async ({ api, arrange }) => {
      await allure.story("Upload");
      await allure.description(`${name} uploaded from a URL is stored in the folder under its own name.`);
      const folderName = await test.step("arrange: an asset folder", () => arrange.content.assetFolder());

      const file = await test.step(`act: upload ${name} from its URL`, () =>
        api.rest.assets.uploadFromUrl(folderName, url));

      await test.step(`assert: ${name} is in the folder`, async () => {
        expect(file.name).toBe(name);
        expect((await api.rest.assets.list(folderName)).map((entry) => entry.name)).toContain(name);
      });
    });
  }

  test("upload a local file", async ({ api, arrange }) => {
    await allure.story("Upload");
    await allure.description("A local file uploaded to a folder is stored under its name, at a URL in the folder.");
    const folderName = await test.step("arrange: an asset folder", () => arrange.content.assetFolder());

    const file = await test.step("act: upload a text file", () =>
      api.rest.assets.upload(folderName, textFile("test-local.txt", "Test asset content")));

    await test.step("assert: the file is stored in the folder", () => {
      expect(file).toMatchObject({ name: "test-local.txt", url: expect.stringContaining(folderName) });
    });
  });

  test("upload a file to local storage", {
    annotation: {
      type: "leaves data",
      description:
        "The platform has no API to list or delete files in its local upload folder; " +
        "every run leaves one small, uniquely named file there.",
    },
  }, async ({ api }) => {
    await allure.story("Upload");
    await allure.description("A file uploaded to the platform's local storage is stored under its name.");
    const name = `${uniqueId("test-local-storage")}.txt`;

    const file = await test.step("act: upload a text file to local storage", () =>
      api.rest.assets.uploadToLocalStorage(textFile(name, "Test storage content")));

    await test.step("assert: the file is stored under its name", () => {
      expect(file.name).toBe(name);
    });
  });

  test("download an uploaded file", async ({ api, arrange }) => {
    await allure.story("Download");
    await allure.description("An uploaded file is served at its URL with its content.");
    const content = "Test downloadable content";
    const { file } = await test.step("arrange: an uploaded file", () =>
      arrange.content.asset(textFile("test-download.txt", content)));

    const downloaded = await test.step("act: download the file", () => api.rest.assets.download(file.url));

    await test.step("assert: the file's content is served", () => {
      expect(downloaded).toBe(content);
    });
  });

  test("stop serving a deleted file", async ({ api, arrange }) => {
    await allure.story("Download");
    await allure.description("A deleted file is no longer served at its URL.");
    const { file } = await test.step("arrange: an uploaded file", () =>
      arrange.content.asset(textFile("test-deleted.txt", "gone")));

    await test.step("act: delete the file", () => api.rest.assets.delete([file.url]));

    await test.step("assert: downloading the file answers 404", async () => {
      await expect(api.rest.assets.download(file.url)).rejects.toBeHttpError(404);
    });
  });

  test("create a folder", async ({ api, cleanup }) => {
    await allure.story("Folders");
    await allure.description("A new folder is listed as a folder.");
    const folderName = uniqueId("test-folder");
    cleanup.push(`delete asset folder ${folderName}`, () => api.rest.assets.folders.delete(folderName));

    await test.step("act: create a folder", () => api.rest.assets.folders.create(folderName));

    await test.step("assert: the folder is listed", async () => {
      expect(await api.rest.assets.find(folderName)).toMatchObject({ name: folderName, type: "folder" });
    });
  });

  test("reject a folder without a name", async ({ api }) => {
    await allure.story("Folders");
    await allure.description("A folder needs a name.");

    await test.step("assert: creating a folder with an empty name is rejected", async () => {
      await expect(api.rest.assets.folders.create("")).rejects.toBeHttpError(400, "Folder name must not be empty");
    });
  });

  test("list the files of a folder", async ({ api, arrange }) => {
    await allure.story("Folders");
    await allure.description("A folder lists exactly the file uploaded to it.");
    const { folderName } = await test.step("arrange: a folder with one file", () =>
      arrange.content.asset(textFile("test-listed.txt", "listed")));

    const entries = await test.step("act: list the folder", () => api.rest.assets.list(folderName));

    await test.step("assert: the folder lists exactly the file", () => {
      expect(entries.map(({ name }) => name)).toEqual(["test-listed.txt"]);
    });
  });

  test("delete a folder", async ({ api, arrange }) => {
    await allure.story("Folders");
    await allure.description("A deleted folder is no longer listed.");
    const folderName = await test.step("arrange: an asset folder", () => arrange.content.assetFolder());

    await test.step("act: delete the folder", () => api.rest.assets.folders.delete(folderName));

    await test.step("assert: the folder is not listed", async () => {
      expect(await api.rest.assets.find(folderName)).toBeUndefined();
    });
  });

  test("delete folders in bulk", async ({ api, arrange }) => {
    await allure.story("Folders");
    await allure.description("Three folders deleted by their URLs in one request are all gone.");
    const folderNames = await test.step("arrange: three asset folders", async () => [
      await arrange.content.assetFolder(),
      await arrange.content.assetFolder(),
      await arrange.content.assetFolder(),
    ]);
    const urls = await test.step("arrange: the folders' URLs", async () =>
      (await api.rest.assets.list()).filter(({ name }) => folderNames.includes(name)).map(({ url }) => url));

    await test.step("act: delete the folders in one request", () => api.rest.assets.delete(urls));

    await test.step("assert: no folder is listed", async () => {
      const remaining = (await api.rest.assets.list()).map(({ name }) => name);
      expect(folderNames.filter((folderName) => remaining.includes(folderName))).toEqual([]);
    });
  });
});

test.describe("platform assets (anonymous)", () => {
  test("reject listing assets anonymously", async ({ api }) => {
    await allure.story("Access");
    await allure.description("Assets are not listed to an anonymous visitor.");

    await test.step("assert: listing assets anonymously answers 401", async () => {
      await expect(api.rest.assets.list()).rejects.toBeHttpError(401);
    });
  });
});
