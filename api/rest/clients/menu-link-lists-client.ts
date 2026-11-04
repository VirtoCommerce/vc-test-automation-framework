import type { HttpClient } from "../../http/http-client";
import type { MenuLinkList, MenuLinkListData } from "../types/content";

import { requireFields, requireFieldsOfEach } from "@core/required-fields";

import { MENU_LINK_LIST } from "../types/content";

export class MenuLinkListsClient {
  readonly #httpClient: HttpClient;
  readonly #path: string;

  constructor(httpClient: HttpClient, storeId: string) {
    this.#httpClient = httpClient;
    this.#path = `/api/cms/${encodeURIComponent(storeId)}/menu`;
  }

  /** Lists the store's menu link lists; `[]` when none (the platform answers with an empty body). */
  async list(): Promise<MenuLinkList[]> {
    const response = await this.#httpClient.get(this.#path);
    const lists = response.optionalJson<MenuLinkListData[]>() ?? [];
    return requireFieldsOfEach(lists, MENU_LINK_LIST.fields, "Menu link list");
  }

  async get(id: string): Promise<MenuLinkList> {
    return requireFields(await this.find(id), MENU_LINK_LIST.fields, `Menu link list "${id}"`);
  }

  async find(id: string): Promise<MenuLinkList | undefined> {
    const response = await this.#httpClient.get(`${this.#path}/${encodeURIComponent(id)}`);
    return response.optionalRecord(MENU_LINK_LIST);
  }

  async save(list: MenuLinkListData): Promise<void> {
    (await this.#httpClient.post(this.#path, { json: list })).expectOk();
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(this.#path, { query: { listIds: ids } })).expectOk();
  }

  async isNameAvailable(name: string, language: string, listId?: string): Promise<boolean> {
    const response = await this.#httpClient.get(`${this.#path}/checkname`, {
      query: { name, language, id: listId },
    });
    return response.json<{ result: boolean }>().result;
  }
}
