import * as allure from "allure-js-commons";

import { newStore } from "@dataset/builders/store";
import { expect, test } from "@fixtures";

test.beforeEach(async () => {
  await allure.epic("REST API");
  await allure.feature("Store");
});

test.describe("stores (store administrator)", () => {
  test.use({ user: "acme_store_administrator@acme.com" });

  test("create a store", async ({ api, cleanup, store }) => {
    await allure.story("Create");
    await allure.description("A new store uses the catalog it was created with.");
    const draft = newStore(store.catalog);
    cleanup.push(`delete store ${draft.id}`, () => api.rest.stores.delete([draft.id]));

    const created = await test.step("act: create a store", () => api.rest.stores.create(draft));

    await test.step("assert: the store uses the catalog of the store under test", () => {
      expect(created).toMatchObject({ id: draft.id, name: draft.name, catalog: store.catalog });
    });
  });

  test("get the store under test", async ({ api, store }) => {
    await allure.story("Read");
    await allure.description("The store under test uses the dataset's catalog.");

    const found = await test.step(`act: get ${store.id}`, () => api.rest.stores.get(store.id));

    await test.step("assert: the store uses the dataset's catalog", () => {
      expect(found).toMatchObject({ id: store.id, catalog: store.catalog });
    });
  });

  test("get a store by id", async ({ api, arrange }) => {
    await allure.story("Read");
    await allure.description("A store is read back by its id.");
    const created = await test.step("arrange: a store", () => arrange.platform.store());

    const reloaded = await test.step("act: get the store", () => api.rest.stores.get(created.id));

    await test.step("assert: the fields match the created store", () => {
      expect(reloaded).toMatchObject({ id: created.id, name: created.name });
    });
  });

  test("search stores by keyword", async ({ api, arrange }) => {
    await allure.story("Search");
    await allure.description("Searching stores by a store's name finds it.");
    const created = await test.step("arrange: a store", () => arrange.platform.store());

    const found = await test.step("act: search stores by its name", () =>
      api.rest.stores.search({ keyword: created.name }));

    await test.step("assert: the store is found", () => {
      expect(found.map(({ id }) => id)).toContain(created.id);
    });
  });

  test("the store administrator is allowed the store under test", async ({ api, store }) => {
    await allure.story("Access");
    await allure.description("The stores allowed for the store administrator include the store under test.");
    const { userId } = await api.storeContext();

    const allowed = await test.step("act: list the stores allowed for the administrator", () =>
      api.rest.stores.listAllowed(userId));

    await test.step(`assert: ${store.id} is allowed`, () => {
      expect(allowed.map(({ id }) => id)).toContain(store.id);
    });
  });

  test("rename a store", async ({ api, arrange }) => {
    await allure.story("Update");
    await allure.description("A renamed store is read back with its new name.");
    const created = await test.step("arrange: a store", () => arrange.platform.store());
    const newName = `${created.name}-renamed`;

    await test.step("act: rename the store", () => api.rest.stores.update({ ...created, name: newName }));

    await test.step("assert: the store has the new name", async () => {
      expect((await api.rest.stores.get(created.id)).name).toBe(newName);
    });
  });

  test("delete a store", async ({ api, arrange }) => {
    await allure.story("Delete");
    await allure.description("A deleted store is no longer found.");
    const created = await test.step("arrange: a store", () => arrange.platform.store());

    await test.step("act: delete the store", () => api.rest.stores.delete([created.id]));

    await test.step("assert: the store is not found", async () => {
      expect(await api.rest.stores.find(created.id)).toBeUndefined();
    });
  });
});
