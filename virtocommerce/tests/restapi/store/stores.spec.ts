import type {
  VirtoCommerceStoreModuleCoreModelStore as Store,
  VirtoCommerceStoreModuleCoreModelSearchStoreSearchResult as StoreSearchResult,
} from "@rest/generated/platform.ts";
import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { newStore } from "@builders/store.ts";
import { STORE_ADMINISTRATOR } from "@dataset/users.ts";
import { expect, test } from "@fixtures";
import { GetMeDocument } from "@graphql/generated/graphql.ts";
import { requireFields } from "@support/require-fields.ts";

const STORES_PATH = "/api/stores";

test.describe("stores (store administrator)", () => {
  test.use({ user: STORE_ADMINISTRATOR });

  test("create a store", async ({ api, arrange, store }) => {
    const draft = newStore(store.catalog);
    arrange.platform.deleteStoreLater(draft.id);

    const created = await test.step("act: create a store", async () =>
      (await api.post(STORES_PATH, { json: draft })).expectOk().json<Store>());

    await test.step("assert: the store uses the catalog of the store under test", () => {
      expect(created).toMatchObject({ id: draft.id, name: draft.name, catalog: store.catalog });
    });
  });

  test("get the store under test", async ({ api, store }) => {
    const found = await test.step(`act: get ${store.id}`, () => storeOf(api, store.id));

    await test.step("assert: the store uses the dataset's catalog", () => {
      expect(found).toMatchObject({ id: store.id, catalog: store.catalog });
    });
  });

  test("get a store by id", async ({ api, arrange }) => {
    const created = await test.step("arrange: a store", () => arrange.platform.store());

    const reloaded = await test.step("act: get the store", () => storeOf(api, created.id));

    await test.step("assert: the fields match the created store", () => {
      expect(reloaded).toMatchObject({ id: created.id, name: created.name });
    });
  });

  test("search stores by keyword", async ({ api, arrange }) => {
    const created = await test.step("arrange: a store", () => arrange.platform.store());

    const found = await test.step("act: search stores by its name", async () =>
      (await api.post(`${STORES_PATH}/search`, { json: { keyword: created.name } }))
        .expectOk()
        .json<StoreSearchResult>().results ?? []);

    await test.step("assert: the store is found", () => {
      expect(found.map(({ id }) => id)).toContain(created.id);
    });
  });

  test("the store administrator is allowed the store under test", async ({ api, graphql, store }) => {
    const { me } = await graphql.execute(GetMeDocument);
    const userId = requireFields(me, ["id"], "The store administrator").id;

    const allowed = await test.step("act: list the stores allowed for the administrator", async () =>
      (await api.get(`${STORES_PATH}/allowed/${userId}`)).expectOk().json<Store[]>());

    await test.step(`assert: ${store.id} is allowed`, () => {
      expect(allowed.map(({ id }) => id)).toContain(store.id);
    });
  });

  test("rename a store", async ({ api, arrange }) => {
    const created = await test.step("arrange: a store", () => arrange.platform.store());
    const newName = `${created.name}-renamed`;

    await test.step("act: rename the store", async () => {
      const stored = requireFields(await storeOf(api, created.id), ["id"], `Store ${created.id}`);
      (await api.put(STORES_PATH, { json: { ...stored, name: newName } })).expectOk();
    });

    await test.step("assert: the store has the new name", async () => {
      expect((await storeOf(api, created.id))?.name).toBe(newName);
    });
  });

  test("delete a store", async ({ api, arrange }) => {
    const created = await test.step("arrange: a store", () => arrange.platform.store());

    await test.step("act: delete the store", async () =>
      (await api.delete(STORES_PATH, { query: { ids: [created.id] } })).expectOk());

    await test.step("assert: the store is not found", async () => {
      expect(await storeOf(api, created.id)).toBeUndefined();
    });
  });
});

async function storeOf(api: HttpClient, id: string): Promise<Store | undefined> {
  return (await api.get(`${STORES_PATH}/${id}`)).optionalJson<Store>();
}
