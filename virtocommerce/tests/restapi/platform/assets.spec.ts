import type {
  VirtoCommerceAssetsModuleCoreAssetsBlobEntry as BlobEntry,
  VirtoCommerceAssetsModuleCoreAssetsBlobEntrySearchResult as BlobEntrySearchResult,
  VirtoCommerceAssetsModuleCoreAssetsBlobInfo as BlobInfo,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { textFile } from "@builders/files.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { uniqueId } from "@support/unique-id.ts";

const ASSETS_PATH = "/api/assets";
const PINNED_REPOSITORY_URL =
  "https://raw.githubusercontent.com/VirtoCommerce/vc-test-automation-framework/08b9d932b5c988d23b551ba8da1e4e2a0ad0b498";
const REMOTE_FILES = [
  { title: "a markdown file", name: "README.md", url: `${PINNED_REPOSITORY_URL}/README.md` },
  { title: "a dotfile", name: ".gitignore", url: `${PINNED_REPOSITORY_URL}/.gitignore` },
] as const;

test.describe("platform assets (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  for (const { title, name, url } of REMOTE_FILES) {
    test(`upload ${title} from a URL`, async ({ api, arrange }) => {
      const folderName = await test.step("arrange: an asset folder", () => arrange.content.assetFolder());

      const [file] = await test.step(`act: upload ${name} from its URL`, async () =>
        (await api.post(ASSETS_PATH, { query: { folderUrl: folderName, url } })).expectOk().json<BlobInfo[]>());

      await test.step(`assert: ${name} is in the folder`, async () => {
        expect(file?.name).toBe(name);
        expect((await assetsIn(api, folderName)).map((entry) => entry.name)).toContain(name);
      });
    });
  }

  test("upload a local file", async ({ api, arrange }) => {
    const folderName = await test.step("arrange: an asset folder", () => arrange.content.assetFolder());

    const [file] = await test.step("act: upload a text file", async () =>
      (
        await api.post(ASSETS_PATH, {
          query: { folderUrl: folderName },
          multipart: { file: textFile("test-local.txt", "Test asset content") },
        })
      )
        .expectOk()
        .json<BlobInfo[]>());

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
    const name = `${uniqueId("test-local-storage")}.txt`;

    const [file] = await test.step("act: upload a text file to local storage", async () =>
      (await api.post(`${ASSETS_PATH}/localstorage`, { multipart: { file: textFile(name, "Test storage content") } }))
        .expectOk()
        .json<BlobInfo[]>());

    await test.step("assert: the file is stored under its name", () => {
      expect(file?.name).toBe(name);
    });
  });

  test("download an uploaded file", async ({ api, arrange }) => {
    const content = "Test downloadable content";
    const { file } = await test.step("arrange: an uploaded file", () =>
      arrange.content.asset(textFile("test-download.txt", content)));

    const downloaded = await test.step("act: download the file", () => api.get(file.url));

    await test.step("assert: the file's content is served", () => {
      expect(downloaded.expectOk().text).toBe(content);
    });
  });

  test("stop serving a deleted file", async ({ api, arrange }) => {
    const { file } = await test.step("arrange: an uploaded file", () =>
      arrange.content.asset(textFile("test-deleted.txt", "gone")));

    await test.step("act: delete the file", async () =>
      (await api.delete(ASSETS_PATH, { query: { urls: [file.url] } })).expectOk());

    await test.step("assert: downloading the file answers 404", async () => {
      expect((await api.get(file.url)).status).toBe(404);
    });
  });

  test("create a folder", async ({ api, arrange }) => {
    const folderName = uniqueId("test-folder");
    arrange.content.deleteAssetFolderLater(folderName);

    await test.step("act: create a folder", async () =>
      (await api.post(`${ASSETS_PATH}/folder`, { json: { name: folderName, parentUrl: "" } })).expectOk());

    await test.step("assert: the folder is listed", async () => {
      expect((await assetsIn(api)).find(({ name }) => name === folderName)).toMatchObject({
        name: folderName,
        type: "folder",
      });
    });
  });

  test("reject a folder without a name", async ({ api }) => {
    await test.step("act and assert: creating a folder with an empty name is rejected", async () => {
      const response = await api.post(`${ASSETS_PATH}/folder`, { json: { name: "", parentUrl: "" } });
      expect(response.status).toBe(400);
      expect(response.text).toContain("Folder name must not be empty");
    });
  });

  test("list the files of a folder", async ({ api, arrange }) => {
    const { folderName } = await test.step("arrange: a folder with one file", () =>
      arrange.content.asset(textFile("test-listed.txt", "listed")));

    const entries = await test.step("act: list the folder", () => assetsIn(api, folderName));

    await test.step("assert: the folder lists exactly the file", () => {
      expect(entries.map(({ name }) => name)).toEqual(["test-listed.txt"]);
    });
  });

  test("delete a folder", async ({ api, arrange }) => {
    const folderName = await test.step("arrange: an asset folder", () => arrange.content.assetFolder());
    const folder = await test.step("arrange: the folder, as the root lists it", async () =>
      (await assetsIn(api)).find(({ name }) => name === folderName));

    await test.step("act: delete the folder", async () =>
      (await api.delete(ASSETS_PATH, { query: { urls: [String(folder?.url)] } })).expectOk());

    await test.step("assert: the folder is not listed", async () => {
      expect((await assetsIn(api)).map(({ name }) => name)).not.toContain(folderName);
    });
  });

  test("delete folders in bulk", async ({ api, arrange }) => {
    const folderNames = await test.step("arrange: three asset folders", async () => [
      await arrange.content.assetFolder(),
      await arrange.content.assetFolder(),
      await arrange.content.assetFolder(),
    ]);
    const urls = await test.step("arrange: the folders' URLs", async () =>
      (await assetsIn(api)).filter(({ name }) => folderNames.includes(String(name))).map(({ url }) => String(url)));

    await test.step("act: delete the folders in one request", async () =>
      (await api.delete(ASSETS_PATH, { query: { urls } })).expectOk());

    await test.step("assert: no folder is listed", async () => {
      const remaining = (await assetsIn(api)).map(({ name }) => name);
      expect(folderNames.filter((folderName) => remaining.includes(folderName))).toEqual([]);
    });
  });
});

test.describe("platform assets (anonymous)", () => {
  test("reject listing assets anonymously", async ({ api }) => {
    await test.step("act and assert: listing assets anonymously answers 401", async () => {
      expect((await api.get(ASSETS_PATH, { query: { folderUrl: "" } })).status).toBe(401);
    });
  });
});

async function assetsIn(api: HttpClient, folderUrl = ""): Promise<BlobEntry[]> {
  const response = await api.get(ASSETS_PATH, { query: { folderUrl } });
  return response.expectOk().json<BlobEntrySearchResult>().results ?? [];
}
