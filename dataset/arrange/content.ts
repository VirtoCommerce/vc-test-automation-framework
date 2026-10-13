import type { ApiSession } from "@api/api-session";
import type { MultipartFile } from "@api/http/http-client";
import type { BlobInfo } from "@api/rest/types/assets";
import type { ContentItem, ContentType } from "@api/rest/types/content";
import type { GroupedPage } from "@api/rest/types/page-builder";
import type { CleanupStack } from "@core/cleanup-stack";
import type { MenuLinkListDraft } from "../builders/content";
import type { StoreUnderTest } from "../store-under-test";
import type { ArrangeContext } from "./context";

import { uniqueId } from "@core/unique-id";

import { newMenuLinkList } from "../builders/content";
import { newPage } from "../builders/page-builder";

/** File uploaded to platform assets, in its own folder. */
export interface ArrangedAsset {
  readonly folderName: string;
  readonly file: BlobInfo;
}

/** File uploaded to store content, in its own folder. */
export interface ArrangedContentFile {
  readonly folderName: string;
  readonly item: ContentItem;
}

/** Arranges platform assets, store content files, menu link lists and page builder pages. */
export class ContentArrange {
  readonly #admin: ApiSession;
  readonly #cleanup: CleanupStack;
  readonly #store: StoreUnderTest;

  constructor({ admin, cleanup, store }: ArrangeContext) {
    this.#admin = admin;
    this.#cleanup = cleanup;
    this.#store = store;
  }

  /**
   * Creates an empty folder in platform assets and deletes it after the test.
   *
   * @returns The folder name.
   */
  async assetFolder(): Promise<string> {
    const { folders } = this.#admin.rest.assets;
    const folderName = uniqueId("test-folder");
    this.#cleanup.push(`delete asset folder ${folderName}`, () => folders.delete(folderName));
    await folders.create(folderName);
    return folderName;
  }

  /** Uploads a file to a new asset folder; the folder and file are deleted after the test. */
  async asset(file: MultipartFile): Promise<ArrangedAsset> {
    const folderName = await this.assetFolder();
    return { folderName, file: await this.#admin.rest.assets.upload(folderName, file) };
  }

  /**
   * Creates an empty folder in the store's content and deletes it after the test.
   *
   * @param contentType - `pages`, `blogs` or `themes`.
   * @returns The folder name.
   */
  async contentFolder(contentType: ContentType): Promise<string> {
    const { folders } = this.#admin.rest.content;
    const folderName = uniqueId("test-folder");
    this.#cleanup.push(`delete ${contentType} folder ${folderName}`, () => folders.delete(contentType, folderName));
    await folders.create(contentType, folderName);
    return folderName;
  }

  /**
   * Uploads a file to a new store content folder; the folder and file are deleted after the test.
   *
   * @param contentType - `pages`, `blogs` or `themes`.
   * @returns The folder and the file as the content API reads it back by name.
   */
  async contentFile(contentType: ContentType, file: MultipartFile): Promise<ArrangedContentFile> {
    const folderName = await this.contentFolder(contentType);
    const { items } = this.#admin.rest.content;
    await items.upload(contentType, folderName, file);
    return { folderName, item: await items.getByName(contentType, file.name) };
  }

  /** Creates a menu link list with links for the store and deletes it after the test. */
  async menuLinkList(): Promise<MenuLinkListDraft> {
    const list = newMenuLinkList(this.#store.id, this.#store.defaultLanguage);
    const { menuLinkLists } = this.#admin.rest;
    this.#cleanup.push(`delete menu link list ${list.name}`, () => menuLinkLists.delete([list.id]));
    await menuLinkLists.save(list);
    return list;
  }

  /**
   * Creates a draft page builder page in the store's default language and deletes it after the test.
   * Use {@link ContentArrange#publishedPage} when the frontend must show it.
   *
   * @param options - Name (unique by default) and texts; see {@link newPage}.
   */
  async page(options: Parameters<typeof newPage>[2] = {}): Promise<GroupedPage> {
    const { pages } = this.#admin.rest.pageBuilder;
    const created = await pages.createGroup(newPage(this.#store.id, this.#store.defaultLanguage, options));
    this.#cleanup.push(`delete page ${created.name}`, () => pages.delete(created.id));
    return created;
  }

  /**
   * Creates a page via {@link ContentArrange#page} and publishes it; deleted after the test.
   *
   * @param options - Name (unique by default) and texts; see {@link newPage}.
   * @returns The page as created, before publishing.
   */
  async publishedPage(options: Parameters<typeof newPage>[2] = {}): Promise<GroupedPage> {
    const created = await this.page(options);
    await this.#admin.rest.pageBuilder.pages.setStatus(created.id, "Published");
    return created;
  }

  /**
   * Deletes the store's pages with exactly this name after the test, for pages the admin UI creates.
   * Only the first 20 keyword matches are checked.
   */
  deletePagesLater(name: string): void {
    const { pages } = this.#admin.rest.pageBuilder;
    this.#cleanup.push(`delete the pages named ${name}`, async () => {
      for (const page of await pages.search({ storeId: this.#store.id, keyword: name, take: 20 })) {
        if (page.name === name) {
          await pages.delete(page.id);
        }
      }
    });
  }
}
