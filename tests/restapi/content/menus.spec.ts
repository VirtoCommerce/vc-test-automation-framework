import * as allure from "allure-js-commons";

import { uniqueId } from "@core/unique-id";
import { newMenuLinkList } from "@dataset/builders/content";
import { expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Content / Menus");
});

test.describe("menu link lists (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("create a menu link list", async ({ api, cleanup, store }) => {
    await allure.story("Create");
    await allure.description("A new menu link list belongs to the store and language, with its links in order.");
    const draft = newMenuLinkList(store.id, store.defaultLanguage);
    cleanup.push(`delete menu link list ${draft.name}`, () => api.rest.menuLinkLists.delete([draft.id]));

    await test.step("act: create a menu link list", () => api.rest.menuLinkLists.save(draft));

    await test.step("assert: the list has its store, language and links", async () => {
      const list = await api.rest.menuLinkLists.get(draft.id);
      expect(list).toMatchObject({ name: draft.name, storeId: store.id, language: store.defaultLanguage });
      expect(list.menuLinks?.map(({ title }) => title)).toEqual(draft.menuLinks.map(({ title }) => title));
    });
  });

  test("check whether a menu link list name is available", async ({ api, arrange, store }) => {
    await allure.story("Names");
    await allure.description(
      "A name in use is taken for other lists but available to the list that has it; an unused name is available.",
    );
    const list = await test.step("arrange: a menu link list", () => arrange.content.menuLinkList());
    const language = store.defaultLanguage;

    const [forOthers, forItself, unused] = await test.step("act: check three names", () =>
      Promise.all([
        api.rest.menuLinkLists.isNameAvailable(list.name, language),
        api.rest.menuLinkLists.isNameAvailable(list.name, language, list.id),
        api.rest.menuLinkLists.isNameAvailable(uniqueId("test-menu"), language),
      ]));

    await test.step("assert: only the list's own name is taken, and only for other lists", () => {
      expect({ forOthers, forItself, unused }).toEqual({ forOthers: false, forItself: true, unused: true });
    });
  });

  test("rename a menu link list", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("A renamed menu link list is read back with its new name.");
    const list = await test.step("arrange: a menu link list", () => arrange.content.menuLinkList());
    const newName = uniqueId("test-menu-renamed");

    await test.step("act: rename the list", () => api.rest.menuLinkLists.save({ ...list, name: newName }));

    await test.step("assert: the list has the new name", async () => {
      expect((await api.rest.menuLinkLists.get(list.id)).name).toBe(newName);
    });
  });

  test("delete a menu link list", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A deleted menu link list is neither read nor listed.");
    const list = await test.step("arrange: a menu link list", () => arrange.content.menuLinkList());

    await test.step("act: delete the list", () => api.rest.menuLinkLists.delete([list.id]));

    await test.step("assert: the list is not found", async () => {
      expect(await api.rest.menuLinkLists.find(list.id)).toBeUndefined();
      expect((await api.rest.menuLinkLists.list()).map(({ id }) => id)).not.toContain(list.id);
    });
  });
});
