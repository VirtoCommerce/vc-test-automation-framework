import type { HttpClient, MultipartFile } from "@virtocommerce/test-automation-framework/http";
import type { ContentType, MenuLinkListDraft } from "../builders/content.ts";
import type { PageOptions } from "../builders/page-builder.ts";
import type {
  VirtoCommerceAssetsModuleCoreAssetsBlobEntrySearchResult as BlobEntrySearchResult,
  VirtoCommerceAssetsModuleCoreAssetsBlobInfo as BlobInfo,
  VirtoCommerceContentModuleCoreModelContentItem as ContentItem,
  VirtoCommercePageBuilderModuleCoreModelsGroupedPageBuilderPage as GroupedPage,
  VirtoCommercePageBuilderModuleCoreModelsGroupedPageBuilderPageSearchResult as GroupedPageSearchResult,
} from "../rest/generated/platform.ts";
import type { WithRequired } from "../support/require-fields.ts";
import type { ArrangeContext } from "./context.ts";

import { contentPath, newMenuLinkList } from "../builders/content.ts";
import { newPage } from "../builders/page-builder.ts";
import { requireFields } from "../support/require-fields.ts";
import { uniqueId } from "../support/unique-id.ts";

/** A page builder page as the platform saved it. */
export type ArrangedPage = WithRequired<GroupedPage, "id" | "name" | "permalink">;

/** A file uploaded to the assets, with its folder. */
export interface ArrangedAsset {
  readonly folderName: string;
  readonly file: WithRequired<BlobInfo, "name" | "url">;
}

/** A file uploaded to the content of the store, with its folder. */
export interface ArrangedContentFile {
  readonly folderName: string;
  readonly item: WithRequired<ContentItem, "name" | "url" | "relativeUrl">;
}

/** Arranges assets, content files, menu link lists and page builder pages of the store under test. */
export interface ContentArrange {
  /** Creates an asset folder at the root of the assets and deletes it, with its files, after the test. */
  assetFolder(): Promise<string>;
  /** Uploads a file to a new asset folder; it is deleted with the folder. */
  asset(file: MultipartFile): Promise<ArrangedAsset>;
  /** Deletes an asset folder at the root of the assets after the test, unless it is already gone. */
  deleteAssetFolderLater(folderName: string): void;
  /** Creates a folder in the content of the store and deletes it, with its items, after the test. */
  contentFolder(contentType: ContentType): Promise<string>;
  /** Uploads a file to a new content folder; it is deleted with the folder. */
  contentFile(contentType: ContentType, file: MultipartFile): Promise<ArrangedContentFile>;
  /** Deletes a content folder of the store after the test, unless it is already gone. */
  deleteContentFolderLater(contentType: ContentType, folderName: string): void;
  /** Creates a menu link list with two links in the default language of the store and deletes it after the test. */
  menuLinkList(): Promise<MenuLinkListDraft>;
  /** Deletes a menu link list after the test, such as one that the code under test creates. */
  deleteMenuLinkListLater(listId: string): void;
  /**
   * Creates a draft page builder page in the default language of the store and deletes it after the test. Use
   * {@link ContentArrange#publishedPage} when the frontend must show it.
   */
  page(options?: PageOptions): Promise<ArrangedPage>;
  /** Creates a page as {@link ContentArrange#page} does, and publishes it. */
  publishedPage(options?: PageOptions): Promise<ArrangedPage>;
  /** Creates a page as {@link ContentArrange#page} does, and archives it. */
  archivedPage(options?: PageOptions): Promise<ArrangedPage>;
  /** Deletes the pages of the store with exactly this name after the test, such as pages the admin UI creates. */
  deletePagesLater(name: string): void;
}

const ASSETS_PATH = "/api/assets";
const PAGES_PATH = "/api/page-builder-pages";
const PAGE_SEARCH_SIZE = 20;

/**
 * Returns the content methods of `arrange`.
 *
 * @param context - What the methods create and remove data with.
 * @returns The methods.
 */
export function contentArrange({ admin, store, later }: ArrangeContext): ContentArrange {
  const menuPath = `/api/cms/${encodeURIComponent(store.id)}/menu`;

  async function assetFolder(): Promise<string> {
    const folderName = uniqueId("test-folder");
    (await (await admin()).post(`${ASSETS_PATH}/folder`, { json: { name: folderName, parentUrl: "" } })).expectOk();
    deleteAssetFolderLater(folderName);
    return folderName;
  }

  async function asset(file: MultipartFile): Promise<ArrangedAsset> {
    const folderName = await assetFolder();
    const response = await (await admin()).post(ASSETS_PATH, { query: { folderUrl: folderName }, multipart: { file } });
    const [uploaded] = response.expectOk().json<BlobInfo[]>();
    return { folderName, file: requireFields(uploaded, ["name", "url"], `File ${file.name} in ${folderName}`) };
  }

  function deleteAssetFolderLater(folderName: string): void {
    later(`delete asset folder ${folderName}`, async () => {
      const client = await admin();
      const { results } = (await client.get(ASSETS_PATH, { query: { folderUrl: "" } }))
        .expectOk()
        .json<BlobEntrySearchResult>();
      const folder = results?.find(({ name }) => name === folderName);
      if (folder?.url) {
        (await client.delete(ASSETS_PATH, { query: { urls: [folder.url] } })).expectOk();
      }
    });
  }

  async function contentFolder(contentType: ContentType): Promise<string> {
    const folderName = uniqueId("test-folder");
    const path = `${contentPath(contentType, store.id)}/folder`;
    (await (await admin()).post(path, { json: { name: folderName, type: "folder" } })).expectOk();
    deleteContentFolderLater(contentType, folderName);
    return folderName;
  }

  async function contentFile(contentType: ContentType, file: MultipartFile): Promise<ArrangedContentFile> {
    const folderName = await contentFolder(contentType);
    const client = await admin();
    const path = contentPath(contentType, store.id);
    (await client.post(path, { query: { folderUrl: folderName }, multipart: { file } })).expectOk();
    const item = (await contentItems(client, contentType, file.name)).find(({ name }) => name === file.name);
    return {
      folderName,
      item: requireFields(item, ["name", "url", "relativeUrl"], `${contentType} item ${file.name}`),
    };
  }

  function deleteContentFolderLater(contentType: ContentType, folderName: string): void {
    later(`delete ${contentType} folder ${folderName}`, async () => {
      const client = await admin();
      const folder = (await contentItems(client, contentType, folderName)).find(({ name }) => name === folderName);
      if (folder?.url) {
        const path = contentPath(contentType, store.id);
        (await client.delete(path, { query: { urls: [folder.url] } })).expectOk();
      }
    });
  }

  async function contentItems(client: HttpClient, contentType: ContentType, keyword: string): Promise<ContentItem[]> {
    const path = `${contentPath(contentType, store.id)}/search`;
    return (await client.get(path, { query: { keyword } })).expectOk().json<ContentItem[]>();
  }

  async function menuLinkList(): Promise<MenuLinkListDraft> {
    const list = newMenuLinkList(store.id, store.defaultLanguage);
    (await (await admin()).post(menuPath, { json: list })).expectOk();
    deleteMenuLinkListLater(list.id);
    return list;
  }

  function deleteMenuLinkListLater(listId: string): void {
    later(`delete menu link list ${listId}`, async () =>
      (await (await admin()).delete(menuPath, { query: { listIds: [listId] } })).expectOk(),
    );
  }

  async function page(options: PageOptions = {}): Promise<ArrangedPage> {
    const client = await admin();
    const draft = newPage(store.id, store.defaultLanguage, options);
    const created = (await client.post(`${PAGES_PATH}/create-group-page`, { json: draft }))
      .expectOk()
      .json<GroupedPage>();
    const arranged = requireFields(created, ["id", "name", "permalink"], `Page ${draft.name}`);
    later(`delete page ${arranged.name}`, async () =>
      (await client.delete(`${PAGES_PATH}/grouped/${encodeURIComponent(arranged.id)}`)).expectOk(),
    );
    return arranged;
  }

  async function publishedPage(options: PageOptions = {}): Promise<ArrangedPage> {
    const arranged = await page(options);
    const path = `${PAGES_PATH}/grouped/publishing/${encodeURIComponent(arranged.id)}`;
    (await (await admin()).post(path, { query: { publish: true } })).expectOk();
    return arranged;
  }

  async function archivedPage(options: PageOptions = {}): Promise<ArrangedPage> {
    const arranged = await page(options);
    (await (await admin()).post(`${PAGES_PATH}/grouped/archive`, { query: { ids: [arranged.id] } })).expectOk();
    return arranged;
  }

  function deletePagesLater(name: string): void {
    later(`delete the pages named ${name}`, async () => {
      const client = await admin();
      const { results } = (
        await client.post(`${PAGES_PATH}/search`, {
          json: { storeId: store.id, keyword: name, take: PAGE_SEARCH_SIZE },
        })
      )
        .expectOk()
        .json<GroupedPageSearchResult>();
      for (const found of results ?? []) {
        if (found.name === name && found.id) {
          (await client.delete(`${PAGES_PATH}/grouped/${encodeURIComponent(found.id)}`)).expectOk();
        }
      }
    });
  }

  return {
    assetFolder,
    asset,
    deleteAssetFolderLater,
    contentFolder,
    contentFile,
    deleteContentFolderLater,
    menuLinkList,
    deleteMenuLinkListLater,
    page,
    publishedPage,
    archivedPage,
    deletePagesLater,
  };
}
