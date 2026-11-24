import type { VirtoCommerceContentModuleCoreModelMenuLinkList as MenuLinkList } from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newMenuLinkList } from "@builders/content.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { uniqueId } from "@support/unique-id.ts";

test.describe("menu link lists (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("create a menu link list", async ({ api, arrange, store }) => {
    const draft = newMenuLinkList(store.id, store.defaultLanguage);
    arrange.content.deleteMenuLinkListLater(draft.id);

    await test.step("act: create a menu link list", async () =>
      (await api.post(menuPath(store.id), { json: draft })).expectOk());

    await test.step("assert: the list has its store, language and links", async () => {
      const list = await menuLinkList(api, store.id, draft.id);
      expect(list).toMatchObject({ name: draft.name, storeId: store.id, language: store.defaultLanguage });
      expect(list?.menuLinks?.map(({ title }) => title)).toEqual(draft.menuLinks.map(({ title }) => title));
    });
  });

  test("check whether a menu link list name is available", async ({ api, arrange, store }) => {
    const list = await test.step("arrange: a menu link list", () => arrange.content.menuLinkList());
    const language = store.defaultLanguage;

    const [forOthers, forItself, unused] = await test.step("act: check three names", () =>
      Promise.all([
        isNameAvailable(api, store.id, { name: list.name, language }),
        isNameAvailable(api, store.id, { name: list.name, language, id: list.id }),
        isNameAvailable(api, store.id, { name: uniqueId("test-menu"), language }),
      ]));

    await test.step("assert: only the list's own name is taken, and only for other lists", () => {
      expect({ forOthers, forItself, unused }).toEqual({ forOthers: false, forItself: true, unused: true });
    });
  });

  test("rename a menu link list", async ({ api, arrange, store }) => {
    const list = await test.step("arrange: a menu link list", () => arrange.content.menuLinkList());
    const newName = uniqueId("test-menu-renamed");

    await test.step("act: rename the list", async () =>
      (await api.post(menuPath(store.id), { json: { ...list, name: newName } })).expectOk());

    await test.step("assert: the list has the new name", async () => {
      expect((await menuLinkList(api, store.id, list.id))?.name).toBe(newName);
    });
  });

  test("delete a menu link list", async ({ api, arrange, store }) => {
    const list = await test.step("arrange: a menu link list", () => arrange.content.menuLinkList());

    await test.step("act: delete the list", async () =>
      (await api.delete(menuPath(store.id), { query: { listIds: [list.id] } })).expectOk());

    await test.step("assert: the list is not found", async () => {
      expect(await menuLinkList(api, store.id, list.id)).toBeUndefined();
      const lists = (await api.get(menuPath(store.id))).optionalJson<MenuLinkList[]>() ?? [];
      expect(lists.map(({ id }) => id)).not.toContain(list.id);
    });
  });
});

function menuPath(storeId: string): string {
  return `/api/cms/${storeId}/menu`;
}

async function menuLinkList(api: HttpClient, storeId: string, id: string): Promise<MenuLinkList | undefined> {
  return (await api.get(`${menuPath(storeId)}/${id}`)).optionalJson<MenuLinkList>();
}

async function isNameAvailable(
  api: HttpClient,
  storeId: string,
  query: { readonly name: string; readonly language: string; readonly id?: string },
): Promise<boolean> {
  const response = await api.get(`${menuPath(storeId)}/checkname`, { query });
  return response.expectOk().json<{ result: boolean }>().result;
}
